import {Component, Inject, OnDestroy, inject} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogActions,
    MatDialogContent,
    MatDialogRef,
    MatDialogTitle,
} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatProgressBar} from '@angular/material/progress-bar';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Subscription} from 'rxjs';
import type {CreateUploadResult, StoredObject} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {EuclidError, isUnauthorized} from '../../../services/euclid-http.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';
import {EsmService, isMultipart, PART_SIZE, partCountOf, UPLOAD_CONCURRENCY} from '../service/esm.service';

/** What the dialog needs to do its work: the bucket it stores into, and where in it. */
export interface ObjectUploadData {
    bucketErn: string;
    bucketName: string;
    /** What the list's prefix box holds, which is where the user is already looking. */
    keyPrefix: string;
}

/**
 * Where the dialog is: choosing a file, sending it, or stopped with something to say.
 *
 * `expired` is its own state rather than a kind of `failed`, because it is the one failure with a way
 * out that is not "try again": the parts already up are still up and still addressable by the same
 * upload ID, so signing in again continues rather than restarts.
 */
type Phase = 'choosing' | 'uploading' | 'failed' | 'expired';

/** Below this much session left, a multipart upload is worth a word before it starts. */
const SESSION_WARNING_SECONDS = 30 * 60;

/**
 * Putting arbitrary bytes into a bucket.
 *
 * Its own dialog rather than a {@link import("../../../shared/resource-add/resource-add.component.js").ResourceAddDialog}
 * with a field or two: that one collects named strings and hands them over, and none of this is a string.
 * A file has to be chosen rather than typed, the key follows from its name until somebody says otherwise,
 * and the content type is a property of the bytes that the browser already knows.
 *
 * It also drives the upload rather than answering with what to upload, which the string-collecting
 * dialogs never do. That is what a file of any size needs: an upload in parts is minutes of work with
 * something to say throughout, and - the reason the sequence is driven from here rather than composed in
 * the service - something to *keep* when it stops. Which parts are still outstanding and which upload
 * they belong to is what makes a failure resumable instead of 12 GB sent again.
 */
@Component({
    selector: 'esm-object-upload-dialog',
    templateUrl: './esm-object-upload.component.html',
    styleUrls: ['./esm-object-upload.component.scss'],
    standalone: true,
    imports: [
        FormsModule,
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatButton,
        MatFormField,
        MatLabel,
        MatHint,
        MatInput,
        MatProgressBar,
    ],
})
export class EsmObjectUploadDialog implements OnDestroy {

    file: File | null = null;
    key = '';
    contentType = '';

    phase: Phase = 'choosing';
    done = 0;
    total = 0;
    error = '';

    /** What the user types to sign in again, held no longer than the call that uses it. */
    password = '';

    protected readonly byteConversion = byteConversion;
    protected readonly partSizeLabel = byteConversion(PART_SIZE);

    private readonly esmService = inject(EsmService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly session = inject(EuclidSessionService);

    /** Whether the key still follows the file's name, which it stops doing once the user edits it. */
    private keyEdited = false;

    /** The upload being assembled, and the parts it is still waiting for. */
    private uploadId = '';
    private remaining: number[] = [];
    private running: Subscription | undefined;

    constructor(
        private readonly dialogRef: MatDialogRef<EsmObjectUploadDialog>,
        @Inject(MAT_DIALOG_DATA) public readonly data: ObjectUploadData,
    ) {
    }

    /**
     * Whatever closed this, an upload still open is one nothing is driving any more.
     *
     * Cancelling is not the only way out: Material closes a dialog on navigation, so leaving the page
     * mid-upload destroys this component without going through {@link cancel}. Both ends up here, and a
     * completed upload has already forgotten its ID - see {@link assemble} - so there is nothing to
     * abort after a success.
     */
    ngOnDestroy(): void {
        this.running?.unsubscribe();
        this.abandon();
    }

    get valid(): boolean {
        return this.file !== null && this.key.trim().length > 0 && this.phase === 'choosing';
    }

    /** Whether this file goes up in parts, which is what the size decides. */
    get multipart(): boolean {
        return this.file !== null && isMultipart(this.file);
    }

    /** How many parts this file becomes, which is what the note before an upload counts. */
    get partCount(): number {
        return this.file === null ? 1 : partCountOf(this.file);
    }

    /** How far along, as a percentage, for the bar. */
    get percentage(): number {
        return this.total > 0 ? Math.round((this.done / this.total) * 100) : 0;
    }

    /**
     * Whether this upload looks likely to outlive the session.
     *
     * A guess, and said as one: how long a file takes depends on a link this page knows nothing about.
     * What it does know is that a session runs out at a fixed moment and that a few thousand parts are
     * not quick, which is enough to be worth saying before the upload rather than after it stops.
     */
    get sessionWarning(): boolean {
        return this.multipart && this.phase === 'choosing' && this.session.secondsLeft < SESSION_WARNING_SECONDS;
    }

    get minutesLeft(): number {
        return Math.ceil(this.session.secondsLeft / 60);
    }

    /** Who the sign-in field is for, so that it is clear which account is being asked about. */
    get userId(): string {
        return this.session.session?.userId ?? '';
    }

    /** How many parts are still to go, which is what a resume has left to do. */
    get outstanding(): number {
        return this.remaining.length;
    }

    /**
     * Whether the key has characters that an HTTP header cannot be trusted to carry.
     *
     * The key travels as `x-euclid-key` rather than in the body, which is the object - so a key is
     * limited to what a header value is, and a browser sends anything above ASCII as one byte per
     * character whatever the server expects to decode. A warning rather than a refusal: what survives is
     * the server's business, and the file this names is one somebody already has.
     */
    get keyWarning(): boolean {
        // eslint-disable-next-line no-control-regex
        return /[^\x20-\x7e]/.test(this.key);
    }

    /**
     * Takes the chosen file, and describes it.
     *
     * The key starts as the prefix the user is already looking under plus the file's name, because a key
     * is a path in every way that matters to somebody reading a listing. The browser's guess at the
     * content type is usually right and always better than `application/octet-stream`, which is what an
     * unknown one falls back to at the server anyway.
     */
    pick(event: Event): void {
        const chosen = (event.target as HTMLInputElement).files?.[0] ?? null;
        if (!chosen) {
            return;
        }
        this.file = chosen;
        this.contentType = chosen.type || 'application/octet-stream';
        if (!this.keyEdited) {
            this.key = this.data.keyPrefix + chosen.name;
        }
    }

    /** The key stops following the file's name the moment somebody types a key of their own. */
    keyChanged(): void {
        this.keyEdited = true;
    }

    /** Sends the file: in one request, or by opening an upload and sending every part of it. */
    send(): void {
        if (!this.valid || !this.file) {
            return;
        }
        this.error = '';
        this.done = 0;

        if (!this.multipart) {
            this.phase = 'uploading';
            this.total = 1;
            this.track(this.esmService
                .putObject(this.data.bucketErn, this.key.trim(), this.file, this.contentType.trim())
                .subscribe({
                    next: (stored: StoredObject) => this.dialogRef.close(stored),
                    error: (error: Error) => this.stopped(error),
                }));
            return;
        }

        this.phase = 'uploading';
        this.total = this.partCount;
        this.track(this.esmService
            .createUpload(this.data.bucketErn, this.key.trim(), UPLOAD_CONCURRENCY)
            .subscribe({
                next: (upload: CreateUploadResult) => {
                    this.uploadId = upload.uploadId;
                    this.remaining = Array.from({length: this.total}, (_, index) => index + 1);
                    this.sendParts();
                },
                error: (error: Error) => this.stopped(error),
            }));
    }

    /**
     * Carries on from wherever it stopped.
     *
     * The parts already accepted stay accepted - they are in the server's scratch directory under this
     * upload ID - so this sends what is left rather than the file again. With nothing left, what failed
     * was the assembly, and that is what is tried again.
     */
    resume(): void {
        if (!this.uploadId || !this.file) {
            this.send();
            return;
        }
        this.error = '';
        if (this.remaining.length > 0) {
            this.sendParts();
        } else {
            this.assemble();
        }
    }

    /** Signs in again as the same user, and carries on with the same upload. */
    signInAndResume(): void {
        const password = this.password;
        this.password = '';
        this.error = '';
        this.phase = 'uploading';

        this.track(this.session.reLogin(password).subscribe({
            next: () => this.resume(),
            error: (error: Error) => {
                this.phase = 'expired';
                this.error = error.message;
            },
        }));
    }

    /**
     * Stops, and tells the server to throw away what was sent.
     *
     * An upload nothing is driving any more is exactly what `abort-upload` is for - new in euclid 0.11,
     * and what this needed. Until then the parts already staged stayed under an ID nothing would refer to
     * again, and so did the object row seeded for bytes that never arrived, which is what otherwise reads
     * as an object stuck at `UPLOADING`.
     *
     * The dialog closes either way. A 404 means the upload completed in the meantime and there is nothing
     * to abort, which is not worth saying; anything else is, because it means the server is still holding
     * something this page asked it to let go of.
     */
    cancel(): void {
        this.running?.unsubscribe();
        this.abandon();
        this.dialogRef.close();
    }

    /** Tells the server to throw away an upload that is still open, once. */
    private abandon(): void {
        if (!this.uploadId) {
            return;
        }
        const uploadId = this.uploadId;
        this.uploadId = '';

        this.esmService.abortUpload(uploadId).subscribe({
            error: (error: Error) => {
                if (!(error instanceof EuclidError) || error.status !== 404) {
                    this.snackBar.open(error.message, 'Not cleaned up', {duration: 10000});
                }
            },
        });
    }

    private sendParts(): void {
        this.phase = 'uploading';
        this.track(this.esmService.uploadParts(this.uploadId, this.file!, [...this.remaining]).subscribe({
            next: (part: number) => {
                this.remaining = this.remaining.filter(outstanding => outstanding !== part);
                this.done = this.total - this.remaining.length;
            },
            error: (error: Error) => this.stopped(error),
            complete: () => this.assemble(),
        }));
    }

    private assemble(): void {
        this.phase = 'uploading';
        this.track(this.esmService.completeUpload(this.uploadId).subscribe({
            // The ID is forgotten before the dialog closes: the upload is the server's now, and what is
            // left of this component must not try to abort something that has already been assembled.
            next: (stored: StoredObject) => {
                this.uploadId = '';
                this.dialogRef.close(stored);
            },
            error: (error: Error) => this.stopped(error),
        }));
    }

    /**
     * Holds what stopped the upload, and says which kind of stop it was.
     *
     * The session is checked before the server's wording is: a token this page can see has expired is a
     * better answer than a 401 whose sentence has to be matched against, and it is right even when the
     * request failed for a reason the server described differently.
     */
    private stopped(error: Error): void {
        this.error = error.message;
        const expired = !this.session.loggedIn || (isUnauthorized(error) && /expired/i.test(error.message));
        this.phase = expired ? 'expired' : 'failed';
    }

    /** One operation at a time, and the last one is what a cancel has to stop. */
    private track(subscription: Subscription): void {
        this.running?.unsubscribe();
        this.running = subscription;
    }
}

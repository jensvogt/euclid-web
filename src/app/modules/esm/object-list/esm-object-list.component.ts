import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {MatDialogConfig} from '@angular/material/dialog';
import {of} from 'rxjs';
import type {EsmObject, PurgeBucketResult, StoredObject} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EsmObjectUploadDialog, ObjectUploadData} from '../object-upload/esm-object-upload.component';
import {bucketNameOf, EsmService, UPLOADING} from '../service/esm.service';
import {esmObjectListFeature} from './state/esm-object-list.state';

/**
 * One bucket's objects.
 *
 * The prefix box narrows by key, which is the only structure a bucket has: keys are opaque strings, and a
 * "directory" is nothing more than a set of them that share a leading segment.
 */
@Component({
    selector: 'esm-object-list',
    templateUrl: './esm-object-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EsmObjectListComponent extends EuclidListComponent<EsmObject> {

    override readonly feature: ListFeature<EsmObject> = esmObjectListFeature;
    // `status` earns its place: an object is written in two steps and the row is finished by the second,
    // so "is this object actually there yet" is a question a listing has to be able to answer.
    override readonly columns = ['key', 'size', 'contentType', 'status', 'encrypted', 'created', 'modified', 'actions'];

    bucketErn = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    constructor(private readonly esmService: EsmService) {
        super();
    }

    override ngOnInit(): void {
        this.bucketErn = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.parent = this.bucketErn;
        super.ngOnInit();
    }

    get bucketName(): string {
        return bucketNameOf(this.bucketErn);
    }

    /**
     * Stores a file in this bucket.
     *
     * Its own dialog rather than {@link addThen}'s, because none of what an upload takes is a string the
     * user types, and because the dialog sends the file itself - a large one goes up in parts over
     * minutes, and the bar reporting that has to be somewhere. So this waits for the object rather than
     * running an action: see {@link EsmObjectUploadDialog}.
     *
     * The prefix box goes in as the key's, which is what somebody looking at `2026/` and uploading a file
     * means by it.
     */
    uploadObject(): void {
        const dialogConfig = new MatDialogConfig();
        dialogConfig.disableClose = true;
        dialogConfig.autoFocus = true;
        // Wider than the string-collecting dialogs: this one has a file to name, a key that is a path and
        // hints that are sentences, and at their width those wrap into each other.
        dialogConfig.width = '52%';
        dialogConfig.minWidth = '560px';
        dialogConfig.data = {
            bucketErn: this.bucketErn,
            bucketName: this.bucketName,
            keyPrefix: this.prefixValue,
        } as ObjectUploadData;

        this.dialog.open(EsmObjectUploadDialog, dialogConfig).afterClosed()
            .subscribe((stored: StoredObject | undefined) => {
                if (stored) {
                    this.run(of(stored), storedMessage(stored));
                }
            });
    }

    deleteObject(object: EsmObject): void {
        this.confirmThen(
            {title: 'Delete object', message: `Delete ${object.key}? This cannot be undone.`},
            this.esmService.deleteObject(object.ern),
            'Object deleted',
        );
    }

    /** Deletes every object under whatever the prefix box currently holds, which may be everything. */
    purge(): void {
        const prefix = this.prefixValue;
        this.confirmThen(
            {
                title: 'Purge bucket',
                message: this.purgeMessage(prefix) + ' The page waits for the server to finish.',
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(this.bucketErn, prefix),
            'Objects deleted',
        );
    }

    /**
     * The same purge, taken on rather than waited for.
     *
     * What a bucket of any size needs: deleting a million objects takes minutes, and a request held open
     * for all of it times out while the deleting carries on behind it - leaving a page that reports a
     * failure for work that is going perfectly well. The server writes the job down instead and answers
     * at once, so what there is to report is how much it took on rather than how much has gone.
     *
     * The reload that follows will still show objects, and that is not the purge having failed.
     */
    purgeInBackground(): void {
        const prefix = this.prefixValue;
        this.confirmThen(
            {
                title: 'Purge in the background',
                message: this.purgeMessage(prefix)
                    + ' The server works through them in the background, so they go on disappearing after this page says it is done.',
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(this.bucketErn, prefix, true),
            (result: PurgeBucketResult) => purgeStarted(result),
        );
    }

    private purgeMessage(prefix: string): string {
        return prefix
            ? `Delete every object in ${this.bucketName} whose key starts with "${prefix}"? This cannot be undone.`
            : `Delete every object in ${this.bucketName}? This cannot be undone.`;
    }
}

/**
 * What the server said it has, as a sentence.
 *
 * `complete-upload` answers as soon as it has taken the assembly on rather than when the object is
 * whole - the row is built by a pass that runs afterwards - so the answer often still reads `UPLOADING`.
 * Saying "uploaded" to that is how a page comes to claim something the storage does not yet agree with,
 * which is worth one extra sentence to avoid.
 */
function storedMessage(stored: StoredObject): string {
    return stored.status === UPLOADING
        ? `${stored.key} sent. The server is still assembling it - reload to watch the status.`
        : `${stored.key} uploaded`;
}

/**
 * What a background purge took on, as a sentence.
 *
 * `count` is what the bucket held when the job was written down rather than what has gone by now, so the
 * wording says "purging" rather than "purged". A server that decided to do it inline after all answers
 * with `background` false, and then the count is final.
 */
function purgeStarted(result: PurgeBucketResult): string {
    if (!result?.background) {
        return `${result?.count ?? 0} objects deleted`;
    }
    return result.jobId
        ? `Purging ${result.count} objects in the background (job ${result.jobId})`
        : `Purging ${result.count} objects in the background`;
}

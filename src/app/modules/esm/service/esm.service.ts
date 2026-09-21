import {Injectable} from '@angular/core';
import {from, map, mergeMap, MonoTypeOperatorFunction, Observable, retry, throwError, timer} from 'rxjs';
import type {
    Bucket,
    CreateUploadResult,
    EsmObject,
    PurgeBucketResult,
    RenameBucketResult,
    StoredObject,
    Variant,
} from 'euclid-ndk';

import {EuclidHttpService, isTransient, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'esm';

/**
 * How much of a file goes into one part, and how many parts travel at once.
 *
 * 5 MiB and four are what euclid-cli, euclid-ndk and euclid-jdk use. Matching them is the point: a file
 * uploaded from this page arrives in the same pieces as one uploaded by any of the others, and a part
 * size is not something a browser has any better information about than they do.
 */
export const PART_SIZE = 5 * 1024 * 1024;
export const UPLOAD_CONCURRENCY = 4;

/**
 * The status an object carries while the server still has work to do on it.
 *
 * Both ways of writing an object leave the row in this state and finish it afterwards, so an object that
 * reads `UPLOADING` a moment after a successful call is the normal case rather than a failed one - and an
 * object that is still in it much later is the interesting one.
 */
export const UPLOADING = 'UPLOADING';

/** Whether this file goes up in parts rather than in a single request. */
export function isMultipart(file: Blob): boolean {
    return file.size >= PART_SIZE;
}

/** How many parts this file becomes. One, for a file that takes the single-request path. */
export function partCountOf(file: Blob): number {
    return Math.max(1, Math.ceil(file.size / PART_SIZE));
}

/** The bytes of one part, numbered from one. A slice holds no memory until it is read. */
function partOf(file: Blob, partNumber: number): Blob {
    const start = (partNumber - 1) * PART_SIZE;
    return file.slice(start, Math.min(start + PART_SIZE, file.size));
}

/**
 * Sends a failed request again, twice, when the failure was the kind that might pass.
 *
 * A transfer is many requests and fails as a whole: one part lost to a server that was briefly unwell
 * would otherwise discard every part already uploaded. A refusal - a key that is wrong, a permission
 * that is missing - is not retried, because it would be refused identically.
 */
function retryTransient<T>(): MonoTypeOperatorFunction<T> {
    return retry({
        count: 2,
        delay: (error: unknown, attempt: number) => isTransient(error) ? timer(attempt * 500) : throwError(() => error),
    });
}

/** ESM - euclid's storage module: buckets and the objects in them. */
@Injectable({providedIn: 'root'})
export class EsmService {

    constructor(private readonly http: EuclidHttpService) {
    }

    listBuckets(query: ListQuery, includeInternal = false): Observable<Page<Bucket>> {
        const payload = {...listPayload(query, 'name'), includeInternal: includeInternal};
        return this.http.page<Bucket>(TARGET, 'list-buckets', 'buckets', payload);
    }

    /**
     * One bucket, by ERN.
     *
     * By ERN rather than by name, which `get-bucket` also takes: a details page was reached from a listing
     * that already said which bucket it meant, and a name would be resolved again in the session's own
     * namespace - a different bucket, or none, for anyone looking at somebody else's.
     */
    getBucket(ern: string): Observable<Bucket> {
        return this.http.call<Record<string, unknown>>(TARGET, 'get-bucket', {ern: ern}).pipe(
            map((response: Record<string, unknown>) => response['bucket'] as Bucket),
        );
    }

    createBucket(name: string, internal = false): Observable<unknown> {
        return this.http.call(TARGET, 'create-bucket', {name: name, internal: internal});
    }

    /**
     * Deletes a bucket, and its objects with it.
     *
     * Not what it used to be: the server no longer refuses a bucket with objects in it, so this is the
     * destructive one and {@link purgeBucket} is the one that keeps the bucket.
     *
     * `background` has the server answer as soon as it has written the work down rather than when it has
     * finished, which is what a bucket of any size needs - emptying one can take minutes, and a request
     * held open for all of it is a request that times out. The bucket stays listed until the emptying
     * finishes, so a listing that still shows it is not a failure.
     */
    deleteBucket(ern: string, background = false): Observable<unknown> {
        return this.http.call(TARGET, 'delete-bucket', {ern: ern, async: background});
    }

    /**
     * Renames a bucket, and with it every object and subscription that named the old one.
     *
     * The ERN changes too and nothing answers to the old one afterwards, which is why the result is typed:
     * a view that is about this one bucket has to follow it to the new ERN.
     */
    renameBucket(ern: string, newName: string): Observable<RenameBucketResult> {
        return this.http.call<RenameBucketResult>(TARGET, 'rename-bucket', {ern: ern, newName: newName});
    }

    /**
     * Deletes every object in a bucket, or every object under a prefix, and keeps the bucket.
     *
     * `background` has the server answer as soon as it has written the work down rather than when it has
     * finished. That is what a bucket of any size needs - emptying one can take minutes, and a request
     * held open for all of it is a request that times out while the deleting carries on invisibly behind
     * it - and the job it writes down outlives the instance that took it on, so an instance the
     * autoscaler stops does not abandon a half-finished purge.
     *
     * The result's `count` then says what the bucket held when the work was taken on rather than what has
     * gone, and `jobId` names the job doing it.
     */
    purgeBucket(ern: string, prefix = '', background = false): Observable<PurgeBucketResult> {
        return this.http.call<PurgeBucketResult>(TARGET, 'purge-bucket', {
            ern: ern,
            prefix: prefix,
            async: background,
        });
    }

    /**
     * Encrypts a bucket, under a named key or one created for it.
     *
     * An empty `keyId` asks ESM to mint a key, which is the usual case: the point is that the objects are
     * encrypted, not which key it was.
     */
    enableEncryption(bucketErn: string, keyId = ''): Observable<unknown> {
        return this.http.call(TARGET, 'enable-encryption', {bucketErn: bucketErn, keyId: keyId});
    }

    disableEncryption(bucketErn: string): Observable<unknown> {
        return this.http.call(TARGET, 'disable-encryption', {bucketErn: bucketErn});
    }

    setBucketInternal(ern: string, internal: boolean): Observable<unknown> {
        return this.http.call(TARGET, 'set-bucket-internal', {ern: ern, internal: internal});
    }

    /** Tags a bucket. A key that is already tagged keeps its value - {@link setBucketTag} overwrites. */
    addBucketTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'add-bucket-tag', {ern: ern, key: key, value: value});
    }

    /** Tags a bucket, overwriting any value the key already had - which is what editing a tag is. */
    setBucketTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'set-bucket-tag', {ern: ern, key: key, value: value});
    }

    deleteBucketTag(ern: string, key: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-bucket-tag', {ern: ern, key: key});
    }

    // -- objects -------------------------------------------------------------------------------

    /**
     * One page of a bucket's objects.
     *
     * Keys are opaque strings, so a bucket has "directories" only in the sense that keys share a prefix; the
     * markers for them stay out of the listing unless asked for.
     */
    listObjects(bucketErn: string, query: ListQuery, includeDirectories = false): Observable<Page<EsmObject>> {
        const payload = {
            bucketErn: bucketErn,
            ...listPayload(query, 'name'),
            includeDirectories: includeDirectories,
        };
        return this.http.page<EsmObject>(TARGET, 'list-objects', 'objects', payload);
    }

    /**
     * One object's metadata, by the bucket it is in and its key.
     *
     * Not `get-object`, which is how an object's *bytes* are read - it answers with the content rather
     * than with a description of it, and takes the bucket and key as headers for that reason. ESM has no
     * metadata equivalent, so this narrows a listing to the key and picks the exact match out of it. By
     * bucket and key rather than by ERN, because a listing can only be narrowed by key, and because the
     * key is what `rename-object` and the transfer actions take.
     *
     * A page rather than a single match, because a prefix is a prefix: `notes/a.txt` also finds
     * `notes/a.txt.bak`. Directory markers are asked for so that a key which is one can still be opened.
     */
    getObject(bucketErn: string, key: string): Observable<EsmObject> {
        return this.listObjects(bucketErn, {prefix: key, pageSize: 100}, true).pipe(
            map((page: Page<EsmObject>) => {
                const object = page.items.find((candidate: EsmObject) => candidate.key === key);
                if (!object) {
                    throw new Error(`No object ${key} in this bucket.`);
                }
                return object;
            }),
        );
    }

    /**
     * Stores an object in one request, bytes and all.
     *
     * The bucket and the key travel as headers because the body is the object - see
     * {@link EuclidHttpService.postBytes} - and the request's content type becomes the object's, which is
     * what makes an uploaded PDF come back as one rather than as a stream of bytes. Nothing in the
     * multipart sequence carries a content type, so this is the only path on which one can be given.
     *
     * One request, so the whole object has to fit in one: {@link uploadFile} is what decides whether it
     * does, and takes the multipart path when it does not.
     */
    putObject(bucketErn: string, key: string, data: Blob, contentType = ''): Observable<StoredObject> {
        return this.http.postBytes<StoredObject>(TARGET, 'put-object', data, {
            'x-euclid-bucket-ern': bucketErn,
            'x-euclid-key': key,
            'Content-Type': contentType || 'application/octet-stream',
        });
    }

    /**
     * Sends the parts it is given, several at a time, and emits each part number as it lands.
     *
     * The numbers rather than a count, and the parts to send rather than the file: a transfer that was
     * interrupted knows which parts it never got an answer for, and sending only those is what lets it
     * pick up where it stopped instead of sending gigabytes again. The same upload ID, so the server
     * assembles what is already in its scratch directory together with what arrives now.
     *
     * Parts may finish in any order - each carries its own number, and the server assembles by that
     * rather than by arrival.
     */
    uploadParts(
        uploadId: string,
        file: Blob,
        partNumbers: number[],
        concurrency = UPLOAD_CONCURRENCY,
    ): Observable<number> {
        return from(partNumbers).pipe(
            mergeMap(
                (partNumber: number) => this.uploadPart(uploadId, partNumber, partOf(file, partNumber)).pipe(
                    map(() => partNumber),
                ),
                concurrency,
            ),
        );
    }

    /**
     * Opens a multipart upload, declaring how many parts are about to be in flight at once.
     *
     * Which of the two paths a file takes is its size: below one part there is nothing to assemble, and
     * this, the parts and the completion would be three round trips, a scratch directory and an assembly
     * pass to store what {@link putObject} stores in one request. That is the same threshold euclid-cli,
     * euclid-ndk and euclid-jdk cut at, so a file uploaded here arrives in the same pieces as one
     * uploaded by any of them - see {@link isMultipart}.
     */
    createUpload(bucketErn: string, key: string, concurrency: number): Observable<CreateUploadResult> {
        return this.http.call<CreateUploadResult>(
            TARGET,
            'create-upload',
            {bucketErn: bucketErn, key: key},
            {'x-euclid-expected-concurrency': String(concurrency)},
        );
    }

    /** One part, numbered from one. The body is the bytes; everything else is a header. */
    uploadPart(uploadId: string, partNumber: number, data: Blob): Observable<unknown> {
        return this.http.postBytes(TARGET, 'upload-part', data, {
            'x-euclid-upload-id': uploadId,
            'x-euclid-part-number': String(partNumber),
        }).pipe(retryTransient());
    }

    /**
     * Throws away a multipart upload that will not be finished.
     *
     * New in euclid 0.11, and what a cancelled upload needed: until then the parts already sent stayed in
     * the server's scratch directory under an ID nothing would ever refer to again. Discards them, and -
     * for a first upload - the object row that was seeded for bytes which never arrived. A re-upload's row
     * is left alone: that row is the previous version of the object, still published and still readable,
     * and not this upload's to delete.
     *
     * An upload that has already completed answers 404, because there is no longer any such upload.
     */
    abortUpload(uploadId: string): Observable<unknown> {
        return this.http.call(TARGET, 'abort-upload', {uploadId: uploadId});
    }

    /**
     * Assembles the parts into the object.
     *
     * Retried like a part is, and for a stronger reason: failing here discards every part already
     * uploaded. An upload the server did accept answers a repeat with 404 rather than assembling twice.
     */
    completeUpload(uploadId: string): Observable<StoredObject> {
        return this.http.call<StoredObject>(TARGET, 'complete-upload', {uploadId: uploadId}).pipe(retryTransient());
    }

    deleteObject(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-object', {ern: ern});
    }

    /** Renames an object within its bucket - a move that cannot leave it, which is the whole difference. */
    renameObject(bucketErn: string, key: string, newKey: string): Observable<EsmObject> {
        return this.http.call<EsmObject>(TARGET, 'rename-object', {
            bucketErn: bucketErn,
            key: key,
            newKey: newKey,
        });
    }

    /**
     * Copies an object, leaving the source where it is.
     *
     * The copy gets its own bytes and its own ERN, so the two are independent from here on. An object
     * already at the target is refused rather than replaced.
     */
    copyObject(bucketErn: string, key: string, targetBucketErn: string, targetKey: string): Observable<EsmObject> {
        return this.transferObject('copy-object', bucketErn, key, targetBucketErn, targetKey);
    }

    /**
     * Moves an object to another bucket or key, removing the source.
     *
     * The bytes are not copied - the same stored file answers to a different key from now on - so this
     * costs the same whatever the object's size.
     */
    moveObject(bucketErn: string, key: string, targetBucketErn: string, targetKey: string): Observable<EsmObject> {
        return this.transferObject('move-object', bucketErn, key, targetBucketErn, targetKey);
    }

    getObjectCount(bucketErn: string, prefix = ''): Observable<unknown> {
        return this.http.call(TARGET, 'get-object-count', {ern: bucketErn, prefix: prefix});
    }

    // -- object attributes ---------------------------------------------------------------------

    /**
     * Every user-defined attribute of an object, keyed by name.
     *
     * Asked for rather than read off the object, because what a listing carries is up to the listing;
     * this action is what exists to answer the question.
     */
    listObjectAttributes(ern: string): Observable<Record<string, Variant>> {
        return this.http.call<Record<string, unknown>>(TARGET, 'list-object-attributes', {ern: ern}).pipe(
            map((response: Record<string, unknown>) => (response['attributes'] ?? {}) as Record<string, Variant>),
        );
    }

    /** Adds an attribute. One of that name already there keeps its value - {@link setObjectAttribute} overwrites. */
    addObjectAttribute(ern: string, name: string, value: Variant): Observable<unknown> {
        return this.http.call(TARGET, 'add-object-attribute', {ern: ern, name: name, value: value});
    }

    /** Sets an attribute, overwriting any value it already had - which is what editing one is. */
    setObjectAttribute(ern: string, name: string, value: Variant): Observable<unknown> {
        return this.http.call(TARGET, 'set-object-attribute', {ern: ern, name: name, value: value});
    }

    deleteObjectAttribute(ern: string, name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-object-attribute', {ern: ern, name: name});
    }

    /** copy-object and move-object take the same request and differ only in whether the source survives. */
    private transferObject(
        action: string,
        bucketErn: string,
        key: string,
        targetBucketErn: string,
        targetKey: string,
    ): Observable<EsmObject> {
        return this.http.call<EsmObject>(TARGET, action, {
            sourceBucketErn: bucketErn,
            sourceKey: key,
            targetBucketErn: targetBucketErn,
            targetKey: targetKey,
        });
    }
}

/**
 * The bucket's name out of its ERN, which is the last segment of one.
 *
 * A view that was handed an ERN by a route has no bucket to read the name off until the server answers,
 * and a heading that says nothing until then is worse than one taken from the address.
 */
export function bucketNameOf(ern: string): string {
    return ern.substring(ern.lastIndexOf(':') + 1);
}

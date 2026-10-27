import {Injectable} from '@angular/core';
import {
    catchError,
    from,
    map,
    mergeMap,
    MonoTypeOperatorFunction,
    Observable,
    of,
    retry,
    throwError,
    timer,
    toArray,
} from 'rxjs';
import type {
    Bucket,
    CreateUploadResult,
    EsmObject,
    PurgeBucketResult,
    RenameBucketResult,
    StoredObject,
    Variant,
} from 'euclid-ndk';

import {HttpResponse} from '@angular/common/http';

import {
    CallOptions,
    EuclidHttpService,
    isTransient,
    ListQuery,
    listPayload,
    Page,
    PageQuery,
    pagePayload,
} from '../../../services/euclid-http.service';

export const TARGET = 'esm';

/**
 * One lifecycle rule of a bucket: which keys it covers, and how long they may go unused.
 *
 * Declared here rather than imported, because euclid-ndk does not carry the lifecycle actions yet. The
 * shape is EsmServer's `lifecycleRuleToJson()`, which is what both reading and writing them use.
 *
 * `archiveAfterDays` counts from an object's last use - its last read, or its last change for one never
 * read - and `restoreDays` is the grace period a restored object stays online for before the rule
 * applies to it again. The server holds both to 1..36500 days.
 *
 * Where two rules match a key the longer prefix wins, which is how a bucket-wide rule and a stricter one
 * for one folder live together.
 */
export interface LifecycleRule {
    id: string;
    prefix: string;
    archiveAfterDays: number;
    restoreDays: number;
    enabled: boolean;
}

/**
 * The separator a key's path is cut at, which is the only one the server takes.
 *
 * A bucket has no directories: a key is one opaque string, and a "directory" is the set of keys sharing
 * a leading segment up to one of these. Everything a tree shows is derived from that.
 */
export const LEVEL_SEPARATOR = '/';

/** One level of a bucket: a page of the objects in it, and every directory below it. */
export interface ObjectLevel extends Page<EsmObject> {
    directories: string[];
}

/** The path as the server wants a level named: ending in the separator, or empty for the root. */
export function levelOf(path: string): string {
    if (!path || path.endsWith(LEVEL_SEPARATOR)) {
        return path;
    }
    return path + LEVEL_SEPARATOR;
}

/** Whether this prefix names a level rather than the start of a key. */
export function isLevel(prefix: string): boolean {
    return prefix === '' || prefix.endsWith(LEVEL_SEPARATOR);
}

/** The last segment of a directory path: `2026/01/` is `01`. */
export function levelName(path: string): string {
    const segments = path.split(LEVEL_SEPARATOR).filter(segment => segment !== '');
    return segments.length === 0 ? '' : segments[segments.length - 1];
}

/** What the server holds a rule's two periods to. */
export const MIN_LIFECYCLE_DAYS = 1;
export const MAX_LIFECYCLE_DAYS = 36500;

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

/** How long {@link EsmService.awaitSettled} waits for the server to finish with an object, and in what steps. */
const SETTLE_ATTEMPTS = 30;
const SETTLE_DELAY_MS = 1000;

/**
 * The largest object a page will pull into the browser to show.
 *
 * Not a limit on what euclid stores or serves - it is what a browser can hold in a string and a person
 * can be shown at once. An object above it is not read at all rather than read and truncated, since
 * `get-object` answers with the whole thing or with 413 and has no notion of a range.
 */
export const MAX_INLINE_SIZE = 1024 * 1024;

/**
 * What every request of an upload carries: an expired session is the dialog's to handle, not the app's.
 *
 * The upload dialog asks for the password where it stands and carries on from the part it stopped at,
 * which is only possible while it is still on screen - see
 * {@link import("../../../services/session-expiry.interceptor.js").SkipAuthRedirect}. Being sent to the
 * login page instead would take the upload ID and the outstanding parts with it, and 12 GB would have to
 * go up again.
 */
const OWNS_EXPIRY: CallOptions = {ownsExpiry: true};

/** Whether this file goes up in parts rather than in a single request. */
export function isMultipart(file: Blob): boolean {
    return file.size >= PART_SIZE;
}

/** How many parts this file becomes. One, for a file that takes the single-request path. */
export function partCountOf(file: Blob): number {
    return Math.max(1, Math.ceil(file.size / PART_SIZE));
}

/** Every part number of this file, in order, which is what a whole upload has to send. */
export function partNumbersOf(file: Blob): number[] {
    return Array.from({length: partCountOf(file)}, (unused, index) => index + 1);
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
        return this.http.call<Record<string, unknown>>(TARGET, 'purge-bucket', {
            ern: ern,
            prefix: prefix,
            async: background,
        }).pipe(
            // The server's own words: it answers `async` for what euclid-ndk's parser calls `background`,
            // and names the figure `count` or `objects` depending on the action. This UI reads the raw
            // answer, so the renaming is its own to do.
            map((result: Record<string, unknown>) => ({
                ern: String(result['ern'] ?? ''),
                count: Number(result['count'] ?? result['objects'] ?? 0),
                jobId: String(result['jobId'] ?? ''),
                background: Boolean(result['async']),
            })),
        );
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

    // -- lifecycle -----------------------------------------------------------------------------

    /** A bucket's lifecycle rules, which is the whole set or none: there is no reading one of them. */
    getBucketLifecycle(ern: string): Observable<LifecycleRule[]> {
        return this.http.all<LifecycleRule>(TARGET, 'get-bucket-lifecycle', 'rules', {ern: ern});
    }

    /**
     * Replaces a bucket's lifecycle rules with these.
     *
     * The whole set, because that is what the action takes - and what it validates: the server checks
     * every rule before it stores any of them, so a bucket never ends up holding half of a set. Adding,
     * changing and removing one rule are therefore all the same call, with the array composed here.
     */
    setBucketLifecycle(ern: string, rules: LifecycleRule[]): Observable<LifecycleRule[]> {
        return this.http.all<LifecycleRule>(TARGET, 'set-bucket-lifecycle', 'rules', {ern: ern, rules: rules});
    }

    /** Removes every rule. What was already archived stays archived - a rule says what to archive, not what to bring back. */
    deleteBucketLifecycle(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-bucket-lifecycle', {ern: ern});
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
     * One object's bytes, in a single request.
     *
     * `x-euclid-part-size` is the largest answer the caller will take, and the server compares an
     * object's size against it with `>=` - so the limit goes out one byte higher, or an object of exactly
     * that size would be refused. An object above it answers 413, which is the server saying the
     * multipart path is the way to read this one rather than that anything is wrong, and an object still
     * being written answers 409.
     *
     * The response rather than the blob: the content type the object was stored under is what decides
     * how it can be shown.
     */
    getObjectBytes(bucketErn: string, key: string, maxInlineSize = MAX_INLINE_SIZE): Observable<HttpResponse<Blob>> {
        return this.http.getBytes(TARGET, 'get-object', {
            'x-euclid-bucket-ern': bucketErn,
            'x-euclid-key': key,
            'x-euclid-part-size': String(maxInlineSize + 1),
        });
    }

    /**
     * One level of a bucket: the objects directly in it, and the directories below it.
     *
     * The same action as {@link listObjects} asked a different question. Without a delimiter the prefix
     * is matched against every key and the answer is the whole subtree; with one it names a level, and
     * what lies below comes back as `commonPrefixes` rather than as the keys inside them. That is what
     * makes a tree affordable: the server finds a level's directories with one index seek each - eight
     * seeks and 28ms for the root of a bucket holding 7.9 million objects - instead of reading the
     * subtree to work out what the folders are.
     *
     * A level is a path that ends in its separator, and the root is the empty string; the server refuses
     * anything else, because `notes` and `notes/` are different questions and only one of them was asked.
     *
     * Ordered by key, always: in this mode the server reads the page straight out of the
     * `(bucketErn, parent, directory, key)` index, and any other column would throw that away.
     */
    listLevel(bucketErn: string, level: string, query: PageQuery): Observable<ObjectLevel> {
        const payload = {
            bucketErn: bucketErn,
            prefix: levelOf(level),
            delimiter: LEVEL_SEPARATOR,
            ...pagePayload(query, 'key'),
        };
        return this.http.call<Record<string, unknown>>(TARGET, 'list-objects', payload).pipe(
            map((response: Record<string, unknown>) => ({
                total: typeof response['total'] === 'number' ? response['total'] : 0,
                items: Array.isArray(response['objects']) ? response['objects'] as EsmObject[] : [],
                directories: Array.isArray(response['commonPrefixes']) ? response['commonPrefixes'] as string[] : [],
            })),
        );
    }

    /**
     * Only the directories of a level, for the tree that shows them.
     *
     * One row asked for and ignored: the directories come whole whatever the page size, and a page of
     * objects is what the table is separately asking for.
     */
    listDirectories(bucketErn: string, level: string): Observable<string[]> {
        return this.listLevel(bucketErn, level, {pageSize: 1, pageIndex: 0}).pipe(
            map((level: ObjectLevel) => level.directories),
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
        }, OWNS_EXPIRY);
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
     * Stores a whole file, by whichever of the two paths its size calls for.
     *
     * For a caller that wants the file stored and nothing else to do with how. The upload dialog does
     * not use this and should not: it has to survive a session expiring mid-transfer and pick up from
     * the parts already sent, which means holding the upload ID and the outstanding part numbers where a
     * person can act on them. This is the version for an upload nobody is watching - an application's
     * artifact on its way to a redeploy - where a failure is one message and a fresh attempt.
     *
     * Emits once, when the object is the server's.
     */
    uploadFile(bucketErn: string, key: string, file: File): Observable<unknown> {
        if (!isMultipart(file)) {
            return this.putObject(bucketErn, key, file, file.type);
        }
        return this.createUpload(bucketErn, key, UPLOAD_CONCURRENCY).pipe(
            mergeMap((upload: CreateUploadResult) => this.uploadParts(
                upload.uploadId,
                file,
                partNumbersOf(file),
            ).pipe(
                // `toArray` rather than `last`: the parts emit as they land, and what matters here is
                // that they all did before the assembly is asked for.
                toArray(),
                mergeMap(() => this.completeUpload(upload.uploadId)),
            )),
        );
    }

    /**
     * Waits for the server to finish with an object it has already accepted.
     *
     * Both ways of writing an object leave the row `UPLOADING` and settle it afterwards, and until that
     * has happened the object is not something another module will act on: EAP refuses to deploy an
     * artifact mid-upload, because the checksum on the row still belongs to the build being replaced.
     * So an upload that is the first half of something else has to wait here.
     *
     * Polls, because there is nothing to subscribe to - and gives up saying so, since a large object
     * assembling for longer than this is still assembling rather than broken.
     */
    awaitSettled(bucketErn: string, key: string, attempts = SETTLE_ATTEMPTS): Observable<EsmObject> {
        return this.getObject(bucketErn, key).pipe(
            mergeMap((object: EsmObject) => object.status === UPLOADING
                ? throwError(() => new Error('pending'))
                : of(object)),
            retry({count: attempts, delay: SETTLE_DELAY_MS}),
            catchError(() => throwError(() => new Error(
                `${key} is stored but the server has not finished with it yet. Try again in a moment.`))),
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
            OWNS_EXPIRY,
        );
    }

    /** One part, numbered from one. The body is the bytes; everything else is a header. */
    uploadPart(uploadId: string, partNumber: number, data: Blob): Observable<unknown> {
        return this.http.postBytes(TARGET, 'upload-part', data, {
            'x-euclid-upload-id': uploadId,
            'x-euclid-part-number': String(partNumber),
        }, OWNS_EXPIRY).pipe(retryTransient());
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
        return this.http.call(TARGET, 'abort-upload', {uploadId: uploadId}, {}, OWNS_EXPIRY);
    }

    /**
     * Assembles the parts into the object.
     *
     * Retried like a part is, and for a stronger reason: failing here discards every part already
     * uploaded. An upload the server did accept answers a repeat with 404 rather than assembling twice.
     */
    completeUpload(uploadId: string): Observable<StoredObject> {
        return this.http
            .call<StoredObject>(TARGET, 'complete-upload', {uploadId: uploadId}, {}, OWNS_EXPIRY)
            .pipe(retryTransient());
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

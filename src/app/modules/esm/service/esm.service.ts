import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Bucket, EsmObject} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'esm';

/** ESM - euclid's storage module: buckets and the objects in them. */
@Injectable({providedIn: 'root'})
export class EsmService {

    constructor(private readonly http: EuclidHttpService) {
    }

    listBuckets(query: ListQuery, includeInternal = false): Observable<Page<Bucket>> {
        const payload = {...listPayload(query, 'name'), includeInternal: includeInternal};
        return this.http.page<Bucket>(TARGET, 'list-buckets', 'buckets', payload);
    }

    createBucket(name: string, internal = false): Observable<unknown> {
        return this.http.call(TARGET, 'create-bucket', {name: name, internal: internal});
    }

    /** Deletes a bucket. It has to be empty - see {@link purgeBucket}. */
    deleteBucket(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-bucket', {ern: ern});
    }

    renameBucket(ern: string, newName: string): Observable<unknown> {
        return this.http.call(TARGET, 'rename-bucket', {ern: ern, newName: newName});
    }

    /** Deletes every object in a bucket, or every object under a prefix, and keeps the bucket. */
    purgeBucket(ern: string, prefix = ''): Observable<unknown> {
        return this.http.call(TARGET, 'purge-bucket', {ern: ern, prefix: prefix});
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

    deleteObject(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-object', {ern: ern});
    }

    getObjectCount(bucketErn: string, prefix = ''): Observable<unknown> {
        return this.http.call(TARGET, 'get-object-count', {ern: bucketErn, prefix: prefix});
    }
}

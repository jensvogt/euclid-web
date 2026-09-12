import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Certificate, Key} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ekm';

export const AES = 'AES';
export const DEFAULT_KEY_LENGTH = 256;
/** How long a deleted key stays recoverable. Deleting one is not a mistake that can be undone after it. */
export const DEFAULT_PENDING_WINDOW_DAYS = 7;

/** EKM - euclid's key management module: encryption keys and stored certificates. */
@Injectable({providedIn: 'root'})
export class EkmService {

    constructor(private readonly http: EuclidHttpService) {
    }

    // -- keys ----------------------------------------------------------------------------------

    /** One page of keys. Never their material - that does not leave the server. */
    listKeys(query: ListQuery): Observable<Page<Key>> {
        return this.http.page<Key>(TARGET, 'list-keys', 'keys', listPayload(query, 'name'));
    }

    /**
     * Creates a key.
     *
     * The description is worth supplying: a key is identified by a generated ID that says nothing about what
     * it protects, and months later the description is the only thing that answers whether it can be deleted.
     */
    createKey(description = '', algorithm = AES, length = DEFAULT_KEY_LENGTH): Observable<unknown> {
        return this.http.call(TARGET, 'create-key', {
            algorithm: algorithm,
            length: length,
            description: description,
        });
    }

    /** Schedules a key for deletion. Everything it encrypted becomes unreadable when the window closes. */
    deleteKey(keyId: string, pendingWindowInDays = DEFAULT_PENDING_WINDOW_DAYS): Observable<unknown> {
        return this.http.call(TARGET, 'delete-key', {keyId: keyId, pendingWindowInDays: pendingWindowInDays});
    }

    /** Takes a key out of use without destroying it, so what it encrypted stays readable. */
    revokeKey(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'revoke-key', {ern: ern});
    }

    setKeyDescription(ern: string, description: string): Observable<unknown> {
        return this.http.call(TARGET, 'set-key-description', {ern: ern, description: description});
    }

    // -- certificates --------------------------------------------------------------------------

    listCertificates(query: ListQuery): Observable<Page<Certificate>> {
        return this.http.page<Certificate>(TARGET, 'list-certificates', 'certificates', listPayload(query, 'name'));
    }

    /** One stored certificate. The PEM comes back; the private key does not. */
    getCertificate(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'get-certificate', {name: name});
    }

    /**
     * Deletes a certificate, with no grace period.
     *
     * Unlike a key this needs none: nothing becomes unreadable, because a certificate is public. A listener
     * already serving it keeps the copy it loaded until it restarts, which is what makes this recoverable -
     * import a replacement under the same name.
     */
    deleteCertificate(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-certificate', {name: name});
    }
}

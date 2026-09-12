import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Secret, SecretValue} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ess';

/** ESS - euclid's secret store. */
@Injectable({providedIn: 'root'})
export class EssService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /** One page of secrets. Metadata only - no value comes back from a listing. */
    listSecrets(query: ListQuery): Observable<Page<Secret>> {
        return this.http.page<Secret>(TARGET, 'list-secrets', 'secrets', listPayload(query, 'name'));
    }

    /** Stores a secret, and answers with its metadata - never the value it was just given. */
    createSecret(name: string, value: string, description = '', keyErn = ''): Observable<unknown> {
        return this.http.call(TARGET, 'create-secret', {
            name: name,
            value: value,
            description: description,
            keyErn: keyErn,
        });
    }

    /**
     * One secret, decrypted.
     *
     * The only call that answers with a value, and so the point at which a secret enters the browser. The UI
     * asks for it on an explicit "reveal" rather than while listing, and keeps it in no store.
     */
    getSecret(name: string): Observable<SecretValue> {
        return this.http.call<SecretValue>(TARGET, 'get-secret', {name: name});
    }

    /** Replaces a secret's value, leaving its description and key alone. */
    rotateSecret(name: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'update-secret', {name: name, value: value});
    }

    /** Changes only what is named. The server refuses an update that names nothing. */
    updateSecret(name: string, changes: {value?: string; description?: string; keyErn?: string}): Observable<unknown> {
        const payload: Record<string, unknown> = {name: name};
        if (changes.value !== undefined) {
            payload['value'] = changes.value;
        }
        if (changes.description !== undefined) {
            payload['description'] = changes.description;
        }
        // Truthy rather than defined: there is no moving a secret onto the empty key, so an empty string here
        // means "leave it where it is" rather than something to send.
        if (changes.keyErn) {
            payload['keyErn'] = changes.keyErn;
        }
        return this.http.call(TARGET, 'update-secret', payload);
    }

    /** Deletes a secret outright. The value is gone; the key it was under is left alone. */
    deleteSecret(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-secret', {name: name});
    }
}

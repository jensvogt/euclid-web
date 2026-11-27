import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Secret, SecretValue} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ess';

/**
 * What an action on one secret needs to find it: its name, and the ERN that says which namespace it is in.
 *
 * A name alone is not enough. ESS scopes a secret to (account, namespace, name), and a listing made from the
 * account root answers with the secrets of *every* namespace - but `get-secret`, `update-secret` and the rest
 * look a name up in exactly the namespace the request carries, which at the root is the empty one. A secret
 * picked from that listing and acted on by name alone is "not found" unless it happens to live at the root.
 * Every {@link Secret} is one of these.
 */
export type SecretRef = Pick<Secret, 'name' | 'ern'>;

/**
 * The namespace a secret lives in, read off its ERN.
 *
 * ESS's secret DTO has no namespace field, but its ERN is `ern:ess:<region>:<account>:<namespace>:secret:<name>`,
 * so the fifth part is it - empty for a secret at the account root.
 */
export function secretNamespace(secret: SecretRef): string {
    const parts = secret.ern.split(':');
    return parts.length > 4 ? parts[4] : '';
}

/** ESS - euclid's secret store. */
@Injectable({providedIn: 'root'})
export class EssService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /** One page of secrets. Metadata only - no value comes back from a listing. */
    listSecrets(query: ListQuery, namespace?: string): Observable<Page<Secret>> {
        const payload = listPayload(query, 'name');
        if (namespace === undefined) {
            return this.http.page<Secret>(TARGET, 'list-secrets', 'secrets', payload);
        }
        return this.http.call<Record<string, unknown>>(TARGET, 'list-secrets', payload, scopedTo(namespace)).pipe(
            map((response: Record<string, unknown>) => ({
                total: typeof response['total'] === 'number' ? response['total'] as number : 0,
                items: Array.isArray(response['secrets']) ? response['secrets'] as Secret[] : [],
            })),
        );
    }

    /**
     * One secret's metadata, without decrypting it.
     *
     * Not {@link getSecret}, which is the action that answers with the value - and that is precisely what
     * a page reloading itself every minute must not call: it would decrypt a secret over and over to show
     * when it was last rotated. ESS has no metadata-only lookup, so this narrows a listing to the name and
     * picks the exact match out of it. A page rather than a single match, because a prefix is a prefix:
     * `db` also finds `db-password`.
     *
     * `namespace` is the one the secret is in, when it is known. Without it a listing from the account root
     * may hold the same name in several namespaces, and the first is taken.
     */
    getSecretMetadata(name: string, namespace?: string): Observable<Secret> {
        return this.listSecrets({prefix: name, pageSize: 100}, namespace).pipe(
            map((page: Page<Secret>) => {
                const secret = page.items.find((candidate: Secret) =>
                    candidate.name === name && (namespace === undefined || secretNamespace(candidate) === namespace));
                if (!secret) {
                    throw new Error(`No secret ${name} in this namespace.`);
                }
                return secret;
            }),
        );
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
    getSecret(secret: SecretRef): Observable<SecretValue> {
        return this.http.call<SecretValue>(TARGET, 'get-secret', {name: secret.name}, scopedTo(secretNamespace(secret)));
    }

    /** Replaces a secret's value, leaving its description and key alone. */
    rotateSecret(secret: SecretRef, value: string): Observable<unknown> {
        return this.updateSecret(secret, {value: value});
    }

    /** Changes only what is named. The server refuses an update that names nothing. */
    updateSecret(secret: SecretRef, changes: {value?: string; description?: string; keyErn?: string}): Observable<unknown> {
        const payload: Record<string, unknown> = {name: secret.name};
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
        return this.http.call(TARGET, 'update-secret', payload, scopedTo(secretNamespace(secret)));
    }

    /**
     * Tags a secret, by name.
     *
     * Upserted: a tag already there has its value replaced, which is why there is no separate action for
     * editing one - ESS has no `set-secret-tag`, as EKM has no `set-key-tag`.
     */
    addSecretTag(secret: SecretRef, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'add-secret-tag', {name: secret.name, key: key, value: value},
            scopedTo(secretNamespace(secret)));
    }

    deleteSecretTag(secret: SecretRef, key: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-secret-tag', {name: secret.name, key: key}, scopedTo(secretNamespace(secret)));
    }

    /** Deletes a secret outright. The value is gone; the key it was under is left alone. */
    deleteSecret(secret: SecretRef): Observable<unknown> {
        return this.http.call(TARGET, 'delete-secret', {name: secret.name}, scopedTo(secretNamespace(secret)));
    }
}

/**
 * The request scoped to one namespace rather than the session's.
 *
 * Overrides the session's `x-euclid-namespace` (see `EuclidHttpService.call`) - set even when empty, because
 * the empty namespace is the account root and that is a place a secret can be, not the absence of one.
 */
function scopedTo(namespace: string): Record<string, string> {
    return {'x-euclid-namespace': namespace};
}

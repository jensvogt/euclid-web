import {Injectable} from '@angular/core';
import {map, Observable, tap} from 'rxjs';
import type {Account, AccessKey, Namespace, User, UserGroup} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';

export const TARGET = 'eam';

/**
 * EAM - euclid's access management module: users, groups, accounts, namespaces and access keys.
 *
 * Login itself is not here but in {@link EuclidSessionService}, because logging in and being logged in
 * need different things: the login is the one call that carries no credentials, and what it produces is
 * the session every call below is made under.
 *
 * The item types come from euclid-ndk as type-only imports. They are the shapes the server already
 * answers with, so restating them here would only be a second place for them to drift - and `import type`
 * is erased at compile time, so nothing of that Node-only package reaches the bundle.
 */
@Injectable({providedIn: 'root'})
export class EamService {

    constructor(private readonly http: EuclidHttpService, private readonly session: EuclidSessionService) {
    }

    // -- users ---------------------------------------------------------------------------------

    listUsers(query: ListQuery): Observable<Page<User>> {
        return this.http.page<User>(TARGET, 'list-users', 'users', listPayload(query, 'userId'));
    }

    /** Creates a user. The account and region default to the session's own, as euclid-ndk's `register` does. */
    register(userId: string, password: string, email = '', isAdmin = false): Observable<unknown> {
        const session = this.session.session;
        return this.http.call(TARGET, 'register', {
            userId: userId,
            password: password,
            email: email,
            accountId: session?.accountId ?? '',
            region: session?.region ?? '',
            isAdmin: isAdmin,
        });
    }

    deleteUser(userId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-user', {userId: userId});
    }

    // -- namespace scoping ---------------------------------------------------------------------

    /**
     * Switches the namespace every namespace-scoped call is restricted to.
     *
     * The session is updated only once the server has agreed, because the server is what decides: it checks
     * the namespace against the current account and the caller's grants. An empty string clears the scope,
     * which is the account root rather than "all of them".
     */
    changeNamespace(namespace: string): Observable<unknown> {
        return this.http.call(TARGET, 'change-namespace', {namespace: namespace}).pipe(
            tap(() => this.session.setNamespace(namespace)),
        );
    }

    // -- access keys ---------------------------------------------------------------------------

    /**
     * This user's own access keys, as a page.
     *
     * `list-access-keys` answers with an array and no total - there are a handful per user - so the page a
     * list view needs is made here.
     */
    listAccessKeys(): Observable<Page<AccessKey>> {
        return this.http.all<AccessKey>(TARGET, 'list-access-keys', 'accessKeys').pipe(
            map((items: AccessKey[]) => ({total: items.length, items: items})),
        );
    }

    /** Creates an access key. The secret comes back here and nowhere else - `list-access-keys` never shows it. */
    createAccessKey(): Observable<{accessKeyId?: string; secretAccessKey?: string}> {
        return this.http.call(TARGET, 'create-access-key');
    }

    deleteAccessKey(accessKeyId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-access-key', {accessKeyId: accessKeyId});
    }

    // -- user groups ---------------------------------------------------------------------------

    listUserGroups(query: ListQuery): Observable<Page<UserGroup>> {
        return this.http.page<UserGroup>(TARGET, 'list-user-groups', 'userGroups', listPayload(query, 'name'));
    }

    /** Creates an empty user group. Administrator only. */
    createUserGroup(name: string, description = ''): Observable<unknown> {
        return this.http.call(TARGET, 'create-user-group', {name: name, description: description});
    }

    /** Adds a user to a group. Both are ERNs. */
    addUserToUserGroup(userGroup: string, user: string): Observable<unknown> {
        return this.http.call(TARGET, 'user-group-add-user', {userGroup: userGroup, user: user});
    }

    /** Removes a user from a group. Both are ERNs. */
    removeUserFromUserGroup(userGroup: string, user: string): Observable<unknown> {
        return this.http.call(TARGET, 'user-group-remove-user', {userGroup: userGroup, user: user});
    }

    deleteUserGroup(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-user-group', {name: name});
    }

    // -- accounts ------------------------------------------------------------------------------

    listAccounts(query: ListQuery): Observable<Page<Account>> {
        return this.http.page<Account>(TARGET, 'list-accounts', 'accounts', listPayload(query, 'accountId'));
    }

    /** Creates an account. Administrator only - account creation is platform-level. */
    createAccount(accountId: string, name: string, description = ''): Observable<unknown> {
        return this.http.call(TARGET, 'create-account', {accountId: accountId, name: name, description: description});
    }

    /** Deletes an account. Administrator only, and it must have no namespaces or grants left. */
    deleteAccount(accountId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-account', {accountId: accountId});
    }

    // -- namespaces ----------------------------------------------------------------------------

    /** One page of an account's namespaces. The session's own account unless another is named. */
    listNamespaces(query: ListQuery, accountId?: string): Observable<Page<Namespace>> {
        const payload = {accountId: accountId ?? this.session.session?.accountId ?? '', ...listPayload(query, 'name')};
        return this.http.page<Namespace>(TARGET, 'list-namespaces', 'namespaces', payload);
    }

    /** Creates a namespace under an account. Requires admin rights on that account. */
    createNamespace(accountId: string, name: string, description = ''): Observable<unknown> {
        return this.http.call(TARGET, 'create-namespace', {accountId: accountId, name: name, description: description});
    }

    /** Deletes a namespace. Requires admin rights on the account, and no grants may remain. */
    deleteNamespace(accountId: string, name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-namespace', {accountId: accountId, name: name});
    }

    /** Grants a user access to a namespace. Requires admin rights on the account. */
    grantNamespaceAccess(user: string, accountId: string, namespace: string): Observable<unknown> {
        return this.http.call(TARGET, 'grant-namespace-access', {user: user, accountId: accountId, namespace: namespace});
    }

    /** Revokes a user's access to a namespace. Requires admin rights on the account. */
    revokeNamespaceAccess(user: string, accountId: string, namespace: string): Observable<unknown> {
        return this.http.call(TARGET, 'revoke-namespace-access', {user: user, accountId: accountId, namespace: namespace});
    }
}

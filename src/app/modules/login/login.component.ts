import {Component} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import type {Account, Namespace} from 'euclid-ndk';

import {environment} from '../../../environments/environment';
import {EamService, MyAccounts} from '../eam/service/eam.service';
import {EuclidSessionService} from '../../services/euclid-session.service';
import {Page} from '../../services/euclid-http.service';

/**
 * How many namespaces the picker asks for at once.
 *
 * Generous rather than unbounded: this is a dropdown, and an account with more namespaces than this has
 * outgrown one. {@link LoginComponent.hint} says so when it happens rather than quietly showing a prefix.
 */
const NAMESPACE_PAGE_SIZE = 500;

/**
 * The login, which is the only euclid call this UI makes with no credentials on it.
 *
 * `eam:login` is one of the gateway's public actions for exactly this reason. What comes back is the
 * bearer token every other call presents - see {@link EuclidSessionService} for why a browser uses the
 * token rather than signing its requests.
 *
 * **Why the account and namespace are asked for second.** Only the server knows which accounts this user
 * may work in and which namespaces those hold, and it will not answer either without a token. So the
 * card asks for the credentials, logs in, and only then offers what it has been told about - lists to
 * choose from rather than names to remember and spell. The same two steps euclid-rui and euclid-amo
 * have, and the same order, because a namespace belongs to an account: the account settles first, and
 * the namespaces offered are that account's.
 */
@Component({
    selector: 'login-component',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    standalone: true,
    imports: [
        FormsModule,
        MatCard,
        MatCardHeader,
        MatCardTitle,
        MatCardContent,
        MatCardActions,
        MatFormField,
        MatLabel,
        MatHint,
        MatInput,
        MatSelect,
        MatOption,
        MatButton,
        MatProgressSpinner,
    ],
})
export class LoginComponent {

    userId = '';
    password = '';
    endpoint = environment.euclidEndpoint;

    /** Whether the login has succeeded, and the scope is all that is left to settle. */
    signedIn = false;

    /** The accounts this user may work in, once there is a token to ask with. */
    accounts: Account[] = [];

    /** Which of them is their own, which is where a session starts when nobody has chosen. */
    homeAccountId = '';

    /** What the account picker is on. */
    accountId = '';

    /** The namespaces the account has, once there is a token to ask with. Empty before that. */
    namespaces: string[] = [];

    /** How many the account has, which is more than {@link namespaces} holds when they do not fit one page. */
    namespaceTotal = 0;

    /** What the picker is on. Empty is the account root. */
    namespace = '';

    busy = false;
    error = '';

    /** What this browser was last scoped to, which preselects the pickers if they are still offered. */
    private remembered = '';
    private rememberedAccount = '';

    constructor(
        readonly session: EuclidSessionService,
        private readonly eamService: EamService,
        private readonly router: Router,
        private readonly route: ActivatedRoute,
    ) {
    }

    get valid(): boolean {
        return this.userId.trim().length > 0 && this.password.length > 0;
    }

    /**
     * Whether there is an account to choose between.
     *
     * Asking somebody to choose from one option is not a choice, it is a click - so the picker is shown
     * only when there is something to decide. The account is settled either way.
     */
    get accountChoice(): boolean {
        return this.accounts.length > 1;
    }

    /** One account as the picker names it: what it is called, then the ID a request will actually carry. */
    label(account: Account): string {
        const named = account.name && account.name !== account.accountId ? account.name + ' · ' : '';
        return named + account.accountId + (account.accountId === this.homeAccountId ? '   (home)' : '');
    }

    /** What the picker says under itself: the usual note, or that the account has more than fits one page. */
    get hint(): string {
        if (this.namespaceTotal > this.namespaces.length) {
            return `The first ${this.namespaces.length} of ${this.namespaceTotal} - the rest are reachable `
                + 'from the toolbar once inside.';
        }
        return 'The account root is a scope like any other, not "all of them".';
    }

    login(): void {
        if (!this.valid || this.busy) {
            return;
        }
        this.busy = true;
        this.error = '';

        // The session starts at the account root whatever the last one was scoped to, because the namespace
        // is chosen below rather than here. Listing the namespaces under a scope that may since have been
        // revoked would fail for a reason nobody asked about; the root is always a scope this user has.
        this.remembered = localStorage.getItem('namespace') ?? '';
        this.rememberedAccount = this.session.rememberedAccount;
        localStorage.setItem('namespace', '');

        this.session.login(this.userId.trim(), this.password).subscribe({
            next: () => {
                this.signedIn = true;
                this.loadAccounts();
            },
            error: (error: Error) => {
                this.busy = false;
                // The server's own sentence, which is the only thing that distinguishes a wrong password from
                // a gateway that is not running behind the proxy.
                this.error = error.message;
            },
        });
    }

    /**
     * Scopes the session to the chosen namespace and goes on to whatever was asked for.
     *
     * The round trip is skipped when the choice is the scope the session is already in - the account root,
     * the moment after a login - because `change-namespace` would only be told what it just said.
     */
    proceed(): void {
        if (this.busy) {
            return;
        }
        if (this.namespace === this.session.namespace) {
            this.navigate();
            return;
        }
        this.busy = true;
        this.error = '';

        // A round trip rather than a local setting: the server validates the namespace against the account
        // and the caller's grants, which is the same reason the toolbar's switcher is one.
        this.eamService.changeNamespace(this.namespace).subscribe({
            next: () => {
                this.busy = false;
                this.navigate();
            },
            error: (error: Error) => {
                this.busy = false;
                this.error = error.message;
            },
        });
    }

    /**
     * The accounts to offer, and the one to start on.
     *
     * Where to start, in order: what this browser was last in, if it is still one of theirs; else home,
     * because home is where the user's own things are and it is the account every session worked in
     * before this step existed.
     *
     * A server that will not answer leaves the session in the account the login put it in, which is that
     * same home account - so the step degrades to the namespace picker it was, rather than to a page
     * that cannot be got past.
     */
    private loadAccounts(): void {
        this.eamService.listMyAccounts().subscribe({
            next: (mine: MyAccounts) => {
                this.accounts = mine.accounts;
                this.homeAccountId = mine.homeAccountId;
                const known = (id: string) => mine.accounts.some((account: Account) => account.accountId === id);
                this.accountId = known(this.rememberedAccount) ? this.rememberedAccount
                    : known(mine.homeAccountId) ? mine.homeAccountId
                        : mine.accounts[0]?.accountId ?? this.session.session?.accountId ?? '';
                this.useAccount(this.accountId);
            },
            error: () => {
                this.accounts = [];
                this.accountId = this.session.session?.accountId ?? '';
                this.loadNamespaces();
            },
        });
    }

    /**
     * Settles which account this session works in, and goes on to its namespaces.
     *
     * In that order, because a namespace belongs to an account: the request that lists them names the
     * account, and the session has to be in it before anything else is asked for.
     */
    useAccount(accountId: string): void {
        this.accountId = accountId;
        this.busy = true;
        this.error = '';
        this.session.setAccount(accountId);
        this.loadNamespaces();
    }

    /** The namespaces to offer, asked for with the token the login just produced. */
    private loadNamespaces(): void {
        this.eamService.listNamespaces({pageSize: NAMESPACE_PAGE_SIZE}, this.accountId).subscribe({
            next: (page: Page<Namespace>) => {
                this.busy = false;
                this.namespaces = page.items.map((namespace: Namespace) => namespace.name);
                this.namespaceTotal = page.total;
                this.namespace = this.namespaces.includes(this.remembered) ? this.remembered : '';
            },
            error: (error: Error) => {
                this.busy = false;
                // Signed in either way. A user who may not list the account's namespaces can still work in
                // the root, so this is a note beside the picker rather than a login that failed.
                this.error = error.message;
            },
        });
    }

    private navigate(): void {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl ?? '/dashboard');
    }
}

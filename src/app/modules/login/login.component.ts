import {Component} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import type {Namespace} from 'euclid-ndk';

import {environment} from '../../../environments/environment';
import {EamService} from '../eam/service/eam.service';
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
 * **Why the namespace is asked for second.** Only the server knows which namespaces an account has and
 * which of them this user has been granted anything in, and it will not answer that without a token. So
 * the card asks for the credentials, logs in, and only then offers the namespaces it has been told about
 * - a list to choose from rather than a name to remember and spell.
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

    /** Whether the login has succeeded, and the namespace is the only thing left to settle. */
    signedIn = false;

    /** The namespaces the account has, once there is a token to ask with. Empty before that. */
    namespaces: string[] = [];

    /** How many the account has, which is more than {@link namespaces} holds when they do not fit one page. */
    namespaceTotal = 0;

    /** What the picker is on. Empty is the account root. */
    namespace = '';

    busy = false;
    error = '';

    /** The namespace this browser was last scoped to, which preselects the picker if it is still one. */
    private remembered = '';

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
        localStorage.setItem('namespace', '');

        this.session.login(this.userId.trim(), this.password).subscribe({
            next: () => {
                this.signedIn = true;
                this.loadNamespaces();
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

    /** The namespaces to offer, asked for with the token the login just produced. */
    private loadNamespaces(): void {
        this.eamService.listNamespaces({pageSize: NAMESPACE_PAGE_SIZE}).subscribe({
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

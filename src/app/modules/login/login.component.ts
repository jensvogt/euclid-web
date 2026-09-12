import {Component} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle} from '@angular/material/card';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatProgressSpinner} from '@angular/material/progress-spinner';

import {environment} from '../../../environments/environment';
import {EuclidSessionService} from '../../services/euclid-session.service';

/**
 * The login, which is the only euclid call this UI makes with no credentials on it.
 *
 * `eam:login` is one of the gateway's public actions for exactly this reason. What comes back is the
 * bearer token every other call presents - see {@link EuclidSessionService} for why a browser uses the
 * token rather than signing its requests.
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
        MatButton,
        MatProgressSpinner,
    ],
})
export class LoginComponent {

    userId = '';
    password = '';
    namespace = localStorage.getItem('namespace') ?? '';
    endpoint = environment.euclidEndpoint;

    busy = false;
    error = '';

    constructor(
        private readonly session: EuclidSessionService,
        private readonly router: Router,
        private readonly route: ActivatedRoute,
    ) {
    }

    get valid(): boolean {
        return this.userId.trim().length > 0 && this.password.length > 0;
    }

    login(): void {
        if (!this.valid || this.busy) {
            return;
        }
        this.busy = true;
        this.error = '';

        // The namespace is recorded before the login so that the session is built with it, and the user can
        // switch later from the toolbar - which is a round trip, because the server validates it.
        localStorage.setItem('namespace', this.namespace.trim());

        this.session.login(this.userId.trim(), this.password).subscribe({
            next: () => {
                this.busy = false;
                const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
                this.router.navigateByUrl(returnUrl ?? '/dashboard');
            },
            error: (error: Error) => {
                this.busy = false;
                // The server's own sentence, which is the only thing that distinguishes a wrong password from
                // a gateway that is not running behind the proxy.
                this.error = error.message;
            },
        });
    }
}

import {Injectable} from '@angular/core';
import {
    HttpContextToken,
    HttpErrorResponse,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
} from '@angular/common/http';
import {Router} from '@angular/router';
import {MatSnackBar} from '@angular/material/snack-bar';
import {catchError, Observable, throwError} from 'rxjs';

import {EuclidSessionService} from './euclid-session.service';

/**
 * Set on a request that will deal with an expired session itself.
 *
 * One flow does: an upload in parts, which asks for the password where it stands and carries on from the
 * part it stopped at - see
 * {@link import("../modules/esm/object-upload/esm-object-upload.component.js").EsmObjectUploadDialog}.
 * Sending that to the login screen would destroy the dialog, and with it the upload ID and the list of
 * parts still outstanding, so what resumes a 12 GB upload would be lost to a redirect.
 *
 * The same shape as `SkipLoading` in the spinner's interceptor, and for the same reason: a request that
 * knows better than the global rule says so.
 */
export const SkipAuthRedirect = new HttpContextToken<boolean>(() => false);

/**
 * Sends the user to the login screen when their session is no longer good for anything.
 *
 * The guard on each route already does this for a navigation - see
 * {@link import("./auth.guard.js").authGuard} - but most of a session is spent not navigating: a list
 * left open reloads itself on a timer, and once the token behind it has expired that produces a 401 a
 * minute and nothing else. The form the user needs is what should be on screen instead.
 *
 * Two ways in. A token this UI can see has expired is not sent at all - there is nothing to learn from a
 * request that is certain to be refused - and a 401 from the server is taken at its word whatever this
 * side believed. Either way the session is cleared and the address is remembered, so signing in again
 * comes back to the page rather than to the dashboard.
 */
@Injectable()
export class SessionExpiryInterceptor implements HttpInterceptor {

    /** Set while a redirect is on its way, so a page that fired six requests does not ask for six. */
    private signingOut = false;

    constructor(
        private readonly session: EuclidSessionService,
        private readonly router: Router,
        private readonly snackBar: MatSnackBar,
    ) {
    }

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        if (this.handles(request) && !this.session.loggedIn) {
            this.signOut('Your session has expired. Sign in again.');
            return throwError(() => new HttpErrorResponse({
                status: 401,
                statusText: 'Unauthorized',
                error: {error: 'The session expired before this request was sent.'},
            }));
        }

        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                if (error.status === 401 && this.handles(request)) {
                    this.signOut('Your session has ended. Sign in again.');
                }
                return throwError(() => error);
            }),
        );
    }

    /**
     * Whether this request is one whose refusal should send the user to the login screen.
     *
     * Not the login itself: `eam:login` answers a wrong password with 401 too, and redirecting there
     * would replace the message saying so with the form that produced it. Not a request that opted out
     * either - see {@link SkipAuthRedirect}.
     */
    private handles(request: HttpRequest<unknown>): boolean {
        return !request.context.get(SkipAuthRedirect) && request.headers.get('x-euclid-action') !== 'login';
    }

    /** Clears the session and asks for it again, remembering where the user was. */
    private signOut(reason: string): void {
        if (this.signingOut || this.router.url.startsWith('/login')) {
            return;
        }
        this.signingOut = true;

        const returnUrl = this.router.url;
        this.session.logout();
        this.snackBar.open(reason, 'Sign in', {duration: 10000});

        void this.router.navigate(['/login'], {queryParams: {returnUrl: returnUrl}})
            .finally(() => {
                this.signingOut = false;
            });
    }
}

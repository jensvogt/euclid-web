import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';

import {EuclidSessionService} from './euclid-session.service';

/**
 * Keeps the module views behind a login.
 *
 * Not a security boundary - the server is, and it refuses every action this UI can reach without a valid
 * token. This is so that a page does not load, fire nine requests and show nine 401s where a login form
 * would have done, and so that the route the user wanted is remembered while they log in.
 */
export const authGuard: CanActivateFn = (_route, state) => {
    const session = inject(EuclidSessionService);
    const router = inject(Router);

    if (session.loggedIn) {
        return true;
    }
    // An expired session is cleared rather than left to produce 401s on the next attempt.
    session.logout();
    return router.createUrlTree(['/login'], {queryParams: {returnUrl: state.url}});
};

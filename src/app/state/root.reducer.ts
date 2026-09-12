import {ActionReducerMap} from '@ngrx/store';
import {routerReducer, RouterState} from '@ngrx/router-store';

/**
 * The root of the store, which holds only the router.
 *
 * Every module provides its own slice at its own route - see any `*.routes.ts` - so there is nothing an
 * application-wide slice would be for. awsmock-ui keeps a `root` slice holding the backend URL; here the
 * endpoint is a build-time constant and the session is a service, because a bearer token has no business
 * in a store the devtools can inspect and replay.
 */
export interface GlobalState {
    router: RouterState;
}

export const reducers: ActionReducerMap<GlobalState> = {
    router: routerReducer,
};

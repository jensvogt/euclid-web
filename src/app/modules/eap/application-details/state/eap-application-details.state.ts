import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Application} from 'euclid-ndk';

import {EmmService} from '../../../emm/service/emm.service';
import {EapService} from '../../service/eap.service';

/**
 * One application, as the details page shows it, and which machine each of its instances is on.
 *
 * The hosts are a second call and a second field because EAP does not know them: an `Endpoint` is
 * `{instanceId, pid, httpPort}` and nothing in the module maps an instance to a node. EMM does - its
 * module registry carries the processes the manager is running, each with the host the worker running
 * it reported - so the two answers are joined here by instance ID.
 */
export interface EapApplicationDetailsState {
    application: Application | null;
    /** Instance ID to the machine it is on. Empty string means the manager's own host. */
    hosts: Record<string, string>;
    loading: boolean;
    error: string | null;
}

export const eapApplicationDetailsFeatureKey = 'eap-application-details';

export const eapApplicationDetailsActions = {
    load: createAction(`[${eapApplicationDetailsFeatureKey}] Load`, props<{applicationId: string}>()),
    loadSuccess: createAction(
        `[${eapApplicationDetailsFeatureKey}] Load success`,
        props<{application: Application; hosts: Record<string, string>}>(),
    ),
    loadFailure: createAction(`[${eapApplicationDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EapApplicationDetailsState = {
    application: null,
    hosts: {},
    loading: false,
    error: null,
};

export const eapApplicationDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different application is being asked for: the page would otherwise
    // show the one it was last about, or why that failed, under the new one's heading.
    on(eapApplicationDetailsActions.load, (state: EapApplicationDetailsState, {applicationId}): EapApplicationDetailsState => {
        const same = state.application?.applicationId === applicationId;
        return {
            application: same ? state.application : null,
            hosts: same ? state.hosts : {},
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eapApplicationDetailsActions.loadSuccess, (state: EapApplicationDetailsState, {application, hosts}): EapApplicationDetailsState => ({
        ...state,
        application: application,
        hosts: hosts,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eapApplicationDetailsActions.loadFailure, (state: EapApplicationDetailsState, {error}): EapApplicationDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EapApplicationDetailsState>(eapApplicationDetailsFeatureKey);

export const eapApplicationDetailsSelectors = {
    selectApplication: createSelector(selectFeature, state => state?.application ?? null),
    selectHosts: createSelector(selectFeature, state => state?.hosts ?? {}),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * The application, and where its instances are running.
 *
 * The registry is asked after the application rather than beside it, because it has to be: a pool is
 * found by the application's runtime name, and the route carries only an ID.
 *
 * A failing registry does not fail the page. EMM is not wrapped by euclid-ndk and an older server may
 * not answer `list-modules` at all, so the hosts are the one part of this allowed to come back empty -
 * a details page that refused to show an application because it could not name its machines would be
 * worse than one with a column of dashes. `switchMap`, as elsewhere: the answer for an application the
 * page has left is of no interest.
 */
export const loadApplication$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EapService);
        const registry = inject(EmmService);
        return actions$.pipe(
            ofType(eapApplicationDetailsActions.load),
            switchMap(({applicationId}) => service.getApplication(applicationId).pipe(
                switchMap((application: Application) => registry.hostsOf(application.runtimeName).pipe(
                    catchError(() => of({} as Record<string, string>)),
                    map((hosts: Record<string, string>) => eapApplicationDetailsActions.loadSuccess({application, hosts})),
                )),
                catchError((error: Error) => of(eapApplicationDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

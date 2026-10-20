import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, forkJoin, map, of, switchMap} from 'rxjs';
import type {Application, EgressSites} from 'euclid-ndk';

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
    /** The outside sites this application calls and what it is allowed for each. Null when unreadable. */
    egress: EgressSites | null;
    loading: boolean;
    error: string | null;
}

export const eapApplicationDetailsFeatureKey = 'eap-application-details';

export const eapApplicationDetailsActions = {
    load: createAction(`[${eapApplicationDetailsFeatureKey}] Load`, props<{applicationId: string}>()),
    loadSuccess: createAction(
        `[${eapApplicationDetailsFeatureKey}] Load success`,
        props<{application: Application; hosts: Record<string, string>; egress: EgressSites | null}>(),
    ),
    loadFailure: createAction(`[${eapApplicationDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EapApplicationDetailsState = {
    application: null,
    hosts: {},
    egress: null,
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
            egress: same ? state.egress : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eapApplicationDetailsActions.loadSuccess, (state: EapApplicationDetailsState, {application, hosts, egress}): EapApplicationDetailsState => ({
        ...state,
        application: application,
        hosts: hosts,
        egress: egress,
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
    selectEgress: createSelector(selectFeature, state => state?.egress ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * The application, and where its instances are running.
 *
 * The registry is asked after the application rather than beside it, because it has to be: a pool is
 * found by the application's runtime name, and the route carries only an ID.
 *
 * Neither of the two follow-ups can fail the page, and for the same reason in both cases: only the
 * application itself is what this page is about. EMM is not wrapped by euclid-ndk and an older server may
 * not answer `list-modules` at all; `list-egress-sites` arrived in euclid-ndk 0.19 and a server from
 * before it answers 404. A details page that refused to show an application because it could not name the
 * machines, or could not read a rate limiter, would be worse than one with a column of dashes and an empty
 * tab - so each falls back to nothing of its own and the page renders either way.
 *
 * `forkJoin` because the two are independent of each other and both depend on the application: the hosts
 * are found by its runtime name and the sites by its ID, neither of which the route carries. `switchMap`
 * on the outside, as elsewhere: the answer for an application the page has left is of no interest.
 */
export const loadApplication$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EapService);
        const registry = inject(EmmService);
        return actions$.pipe(
            ofType(eapApplicationDetailsActions.load),
            switchMap(({applicationId}) => service.getApplication(applicationId).pipe(
                switchMap((application: Application) => forkJoin({
                    hosts: registry.hostsOf(application.runtimeName).pipe(
                        catchError(() => of({} as Record<string, string>)),
                    ),
                    egress: service.listEgressSites(application.applicationId).pipe(
                        catchError(() => of(null as EgressSites | null)),
                    ),
                }).pipe(
                    map(({hosts, egress}) => eapApplicationDetailsActions.loadSuccess({application, hosts, egress})),
                )),
                catchError((error: Error) => of(eapApplicationDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

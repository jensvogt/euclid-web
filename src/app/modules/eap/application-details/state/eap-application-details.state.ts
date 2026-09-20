import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Application} from 'euclid-ndk';

import {EapService} from '../../service/eap.service';

/**
 * One application, as the details page shows it.
 *
 * One field and one call, unlike the other detail slices: EAP answers `get-application` with everything
 * about an application, its instances included, so there is no second question to ask.
 */
export interface EapApplicationDetailsState {
    application: Application | null;
    loading: boolean;
    error: string | null;
}

export const eapApplicationDetailsFeatureKey = 'eap-application-details';

export const eapApplicationDetailsActions = {
    load: createAction(`[${eapApplicationDetailsFeatureKey}] Load`, props<{applicationId: string}>()),
    loadSuccess: createAction(
        `[${eapApplicationDetailsFeatureKey}] Load success`,
        props<{application: Application}>(),
    ),
    loadFailure: createAction(`[${eapApplicationDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EapApplicationDetailsState = {
    application: null,
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
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eapApplicationDetailsActions.loadSuccess, (state: EapApplicationDetailsState, {application}): EapApplicationDetailsState => ({
        ...state,
        application: application,
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
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for an application the page has left is of no interest. */
export const loadApplication$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EapService);
        return actions$.pipe(
            ofType(eapApplicationDetailsActions.load),
            switchMap(({applicationId}) => service.getApplication(applicationId).pipe(
                map((application: Application) => eapApplicationDetailsActions.loadSuccess({application})),
                catchError((error: Error) => of(eapApplicationDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

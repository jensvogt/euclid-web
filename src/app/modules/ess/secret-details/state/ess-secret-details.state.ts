import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Secret} from 'euclid-ndk';

import {EssService} from '../../service/ess.service';

/**
 * One secret, as the details page shows it - which is to say its metadata and nothing else.
 *
 * There is deliberately no field here for the value. The store is long-lived, inspectable in the
 * devtools and replayed by them, and a secret has no business being in any of that: the page holds a
 * revealed value in a plain field for as long as it is shown, and this slice never sees it. What it
 * carries is what {@link import("../../service/ess.service.js").EssService.getSecretMetadata} answers
 * with, which is what a listing already knew.
 */
export interface EssSecretDetailsState {
    secret: Secret | null;
    loading: boolean;
    error: string | null;
}

export const essSecretDetailsFeatureKey = 'ess-secret-details';

export const essSecretDetailsActions = {
    load: createAction(`[${essSecretDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(`[${essSecretDetailsFeatureKey}] Load success`, props<{secret: Secret}>()),
    loadFailure: createAction(`[${essSecretDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EssSecretDetailsState = {
    secret: null,
    loading: false,
    error: null,
};

export const essSecretDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different secret is being asked for: the page would otherwise show
    // the one it was last about, or why that failed, under the new one's heading.
    on(essSecretDetailsActions.load, (state: EssSecretDetailsState, {name}): EssSecretDetailsState => {
        const same = state.secret?.name === name;
        return {
            secret: same ? state.secret : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(essSecretDetailsActions.loadSuccess, (state: EssSecretDetailsState, {secret}): EssSecretDetailsState => ({
        ...state,
        secret: secret,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(essSecretDetailsActions.loadFailure, (state: EssSecretDetailsState, {error}): EssSecretDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EssSecretDetailsState>(essSecretDetailsFeatureKey);

export const essSecretDetailsSelectors = {
    selectSecret: createSelector(selectFeature, state => state?.secret ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a secret the page has left is of no interest. */
export const loadSecret$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EssService);
        return actions$.pipe(
            ofType(essSecretDetailsActions.load),
            switchMap(({name}) => service.getSecretMetadata(name).pipe(
                map((secret: Secret) => essSecretDetailsActions.loadSuccess({secret})),
                catchError((error: Error) => of(essSecretDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

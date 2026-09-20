import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Key} from 'euclid-ndk';

import {EkmService} from '../../service/ekm.service';

/**
 * One key, as the details page shows it.
 *
 * One field and one call: `get-key` answers with everything a listing says about a key, and the one
 * thing a key has that it never answers with - its material - is not a field anywhere.
 */
export interface EkmKeyDetailsState {
    key: Key | null;
    loading: boolean;
    error: string | null;
}

export const ekmKeyDetailsFeatureKey = 'ekm-key-details';

export const ekmKeyDetailsActions = {
    load: createAction(`[${ekmKeyDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(`[${ekmKeyDetailsFeatureKey}] Load success`, props<{key: Key}>()),
    loadFailure: createAction(`[${ekmKeyDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EkmKeyDetailsState = {
    key: null,
    loading: false,
    error: null,
};

export const ekmKeyDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different key is being asked for: the page would otherwise show the
    // key it was last about, or why that failed, under the new one's heading.
    on(ekmKeyDetailsActions.load, (state: EkmKeyDetailsState, {name}): EkmKeyDetailsState => {
        const same = state.key?.name === name;
        return {
            key: same ? state.key : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(ekmKeyDetailsActions.loadSuccess, (state: EkmKeyDetailsState, {key}): EkmKeyDetailsState => ({
        ...state,
        key: key,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(ekmKeyDetailsActions.loadFailure, (state: EkmKeyDetailsState, {error}): EkmKeyDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EkmKeyDetailsState>(ekmKeyDetailsFeatureKey);

export const ekmKeyDetailsSelectors = {
    selectKey: createSelector(selectFeature, state => state?.key ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a key the page has left is of no interest. */
export const loadKey$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EkmService);
        return actions$.pipe(
            ofType(ekmKeyDetailsActions.load),
            switchMap(({name}) => service.getKey(name).pipe(
                map((key: Key) => ekmKeyDetailsActions.loadSuccess({key})),
                catchError((error: Error) => of(ekmKeyDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

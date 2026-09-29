import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {TopicMessage} from 'euclid-ndk';

import {EnsService} from '../../service/ens.service';

/**
 * One published message, as the details page shows it.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * for the same reason the topic details slice is: there is one thing rather than a page of them, no paging
 * and no prefix, and the ID it is about comes from the route.
 */
export interface EnsMessageDetailsState {
    message: TopicMessage | null;
    loading: boolean;
    error: string | null;
}

export const ensMessageDetailsFeatureKey = 'ens-message-details';

export const ensMessageDetailsActions = {
    load: createAction(`[${ensMessageDetailsFeatureKey}] Load`, props<{messageId: string}>()),
    loadSuccess: createAction(`[${ensMessageDetailsFeatureKey}] Load success`, props<{message: TopicMessage}>()),
    loadFailure: createAction(`[${ensMessageDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EnsMessageDetailsState = {
    message: null,
    loading: false,
    error: null,
};

export const ensMessageDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different message is being asked for: the page would otherwise show
    // the message it was last about, or why that one could not be read, under the new one's heading.
    on(ensMessageDetailsActions.load, (state: EnsMessageDetailsState, {messageId}): EnsMessageDetailsState => {
        const same = state.message?.messageId === messageId;
        return {
            message: same ? state.message : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(ensMessageDetailsActions.loadSuccess, (state: EnsMessageDetailsState, {message}): EnsMessageDetailsState => ({
        ...state,
        message: message,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as every other slice does it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(ensMessageDetailsActions.loadFailure, (state: EnsMessageDetailsState, {error}): EnsMessageDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EnsMessageDetailsState>(ensMessageDetailsFeatureKey);

export const ensMessageDetailsSelectors = {
    selectMessage: createSelector(selectFeature, state => state?.message ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a message the page has left is of no interest. */
export const loadMessage$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EnsService);
        return actions$.pipe(
            ofType(ensMessageDetailsActions.load),
            switchMap(({messageId}) => service.getMessage(messageId).pipe(
                map((message: TopicMessage) => ensMessageDetailsActions.loadSuccess({message})),
                catchError((error: Error) => of(ensMessageDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

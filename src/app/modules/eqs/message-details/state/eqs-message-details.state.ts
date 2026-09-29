import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {QueueMessage} from 'euclid-ndk';

import {EqsService} from '../../service/eqs.service';

/**
 * One message, as the details page shows it.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * for the same reason the queue details slice is: there is one thing rather than a page of them, no paging
 * and no prefix, and the ID it is about comes from the route.
 *
 * One call fills it. `get-message` answers with the body and both attribute maps on the message, so unlike
 * the object details slice there is no second request for the attributes to wait for or to fail separately.
 */
export interface EqsMessageDetailsState {
    message: QueueMessage | null;
    loading: boolean;
    error: string | null;
}

export const eqsMessageDetailsFeatureKey = 'eqs-message-details';

export const eqsMessageDetailsActions = {
    load: createAction(`[${eqsMessageDetailsFeatureKey}] Load`, props<{messageId: string}>()),
    loadSuccess: createAction(`[${eqsMessageDetailsFeatureKey}] Load success`, props<{message: QueueMessage}>()),
    loadFailure: createAction(`[${eqsMessageDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EqsMessageDetailsState = {
    message: null,
    loading: false,
    error: null,
};

export const eqsMessageDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different message is being asked for: the page would otherwise show
    // the message it was last about, or why that one could not be read, under the new one's heading.
    on(eqsMessageDetailsActions.load, (state: EqsMessageDetailsState, {messageId}): EqsMessageDetailsState => {
        const same = state.message?.messageId === messageId;
        return {
            message: same ? state.message : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eqsMessageDetailsActions.loadSuccess, (state: EqsMessageDetailsState, {message}): EqsMessageDetailsState => ({
        ...state,
        message: message,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as every other slice does it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eqsMessageDetailsActions.loadFailure, (state: EqsMessageDetailsState, {error}): EqsMessageDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EqsMessageDetailsState>(eqsMessageDetailsFeatureKey);

export const eqsMessageDetailsSelectors = {
    selectMessage: createSelector(selectFeature, state => state?.message ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a message the page has left is of no interest. */
export const loadMessage$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EqsService);
        return actions$.pipe(
            ofType(eqsMessageDetailsActions.load),
            switchMap(({messageId}) => service.getMessage(messageId).pipe(
                map((message: QueueMessage) => eqsMessageDetailsActions.loadSuccess({message})),
                catchError((error: Error) => of(eqsMessageDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

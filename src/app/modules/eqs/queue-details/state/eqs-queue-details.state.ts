import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Queue} from 'euclid-ndk';

import {EqsService} from '../../service/eqs.service';

/**
 * One queue, as the details page shows it.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * because a detail view is not a page of a listing: there is one thing rather than an array of them, no
 * paging and no prefix, and the ERN it is about comes from the route.
 */
export interface EqsQueueDetailsState {
    queue: Queue | null;
    loading: boolean;
    error: string | null;
}

export const eqsQueueDetailsFeatureKey = 'eqs-queue-details';

export const eqsQueueDetailsActions = {
    load: createAction(`[${eqsQueueDetailsFeatureKey}] Load`, props<{ern: string}>()),
    loadSuccess: createAction(`[${eqsQueueDetailsFeatureKey}] Load success`, props<{queue: Queue}>()),
    loadFailure: createAction(`[${eqsQueueDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EqsQueueDetailsState = {
    queue: null,
    loading: false,
    error: null,
};

export const eqsQueueDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different queue is being asked for: the page would otherwise show
    // the queue it was last about, or why that one could not be read, under the new one's heading.
    on(eqsQueueDetailsActions.load, (state: EqsQueueDetailsState, {ern}): EqsQueueDetailsState => {
        const same = state.queue?.ern === ern;
        return {
            queue: same ? state.queue : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eqsQueueDetailsActions.loadSuccess, (state: EqsQueueDetailsState, {queue}): EqsQueueDetailsState => ({
        ...state,
        queue: queue,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eqsQueueDetailsActions.loadFailure, (state: EqsQueueDetailsState, {error}): EqsQueueDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EqsQueueDetailsState>(eqsQueueDetailsFeatureKey);

export const eqsQueueDetailsSelectors = {
    selectQueue: createSelector(selectFeature, state => state?.queue ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a queue the page has left is of no interest. */
export const loadQueue$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EqsService);
        return actions$.pipe(
            ofType(eqsQueueDetailsActions.load),
            switchMap(({ern}) => service.getQueue(ern).pipe(
                map((queue: Queue) => eqsQueueDetailsActions.loadSuccess({queue})),
                catchError((error: Error) => of(eqsQueueDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

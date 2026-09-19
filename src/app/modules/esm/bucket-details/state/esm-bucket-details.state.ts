import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Bucket} from 'euclid-ndk';

import {EsmService} from '../../service/esm.service';

/**
 * One bucket, as the details page shows it.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * because a detail view is not a page of a listing: there is one thing rather than an array of them, no
 * paging and no prefix, and the ERN it is about comes from the route. The factory exists to stop nine
 * identical list slices being written nine times; this is not one of them.
 */
export interface EsmBucketDetailsState {
    bucket: Bucket | null;
    loading: boolean;
    error: string | null;
}

export const esmBucketDetailsFeatureKey = 'esm-bucket-details';

export const esmBucketDetailsActions = {
    load: createAction(`[${esmBucketDetailsFeatureKey}] Load`, props<{ern: string}>()),
    loadSuccess: createAction(`[${esmBucketDetailsFeatureKey}] Load success`, props<{bucket: Bucket}>()),
    loadFailure: createAction(`[${esmBucketDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EsmBucketDetailsState = {
    bucket: null,
    loading: false,
    error: null,
};

export const esmBucketDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different bucket is being asked for: the page would otherwise show
    // the bucket it was last about, or why that one could not be read, under the new one's heading.
    on(esmBucketDetailsActions.load, (state: EsmBucketDetailsState, {ern}): EsmBucketDetailsState => {
        const same = state.bucket?.ern === ern;
        return {
            bucket: same ? state.bucket : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(esmBucketDetailsActions.loadSuccess, (state: EsmBucketDetailsState, {bucket}): EsmBucketDetailsState => ({
        ...state,
        bucket: bucket,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(esmBucketDetailsActions.loadFailure, (state: EsmBucketDetailsState, {error}): EsmBucketDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EsmBucketDetailsState>(esmBucketDetailsFeatureKey);

export const esmBucketDetailsSelectors = {
    selectBucket: createSelector(selectFeature, state => state?.bucket ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: after a rename the old ERN's answer is of no interest. */
export const loadBucket$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EsmService);
        return actions$.pipe(
            ofType(esmBucketDetailsActions.load),
            switchMap(({ern}) => service.getBucket(ern).pipe(
                map((bucket: Bucket) => esmBucketDetailsActions.loadSuccess({bucket})),
                catchError((error: Error) => of(esmBucketDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {EsmObject, Variant} from 'euclid-ndk';

import {EsmService} from '../../service/esm.service';

/**
 * One object, as the details page shows it: what it is, and what has been hung off it.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * for the reason the bucket details slice is - there is one thing here rather than a page of them - and
 * with one addition: an object's attributes are a second question to the server, so they are a second
 * field rather than something read off the object.
 */
export interface EsmObjectDetailsState {
    object: EsmObject | null;
    attributes: Record<string, Variant>;
    loading: boolean;
    error: string | null;
}

export const esmObjectDetailsFeatureKey = 'esm-object-details';

export const esmObjectDetailsActions = {
    load: createAction(`[${esmObjectDetailsFeatureKey}] Load`, props<{bucketErn: string; key: string}>()),
    loadSuccess: createAction(
        `[${esmObjectDetailsFeatureKey}] Load success`,
        props<{object: EsmObject; attributes: Record<string, Variant>}>(),
    ),
    loadFailure: createAction(`[${esmObjectDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EsmObjectDetailsState = {
    object: null,
    attributes: {},
    loading: false,
    error: null,
};

export const esmObjectDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different object is being asked for: the page would otherwise show
    // the object it was last about, or why that one could not be read, under the new one's heading.
    on(esmObjectDetailsActions.load, (state: EsmObjectDetailsState, {bucketErn, key}): EsmObjectDetailsState => {
        const same = state.object?.bucketErn === bucketErn && state.object?.key === key;
        return {
            object: same ? state.object : null,
            attributes: same ? state.attributes : {},
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(esmObjectDetailsActions.loadSuccess, (state: EsmObjectDetailsState, {object, attributes}): EsmObjectDetailsState => ({
        ...state,
        object: object,
        attributes: attributes,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(esmObjectDetailsActions.loadFailure, (state: EsmObjectDetailsState, {error}): EsmObjectDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EsmObjectDetailsState>(esmObjectDetailsFeatureKey);

export const esmObjectDetailsSelectors = {
    selectObject: createSelector(selectFeature, state => state?.object ?? null),
    selectAttributes: createSelector(selectFeature, state => state?.attributes ?? {}),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * Loading one object and its attributes.
 *
 * Two calls in sequence rather than side by side, because the attributes are asked for by the object's
 * ERN and the listing is what says what that is. `switchMap` twice over: after a rename the answer to the
 * key the page has left is of no interest, and neither is the attribute list hanging off it.
 */
export const loadObject$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EsmService);
        return actions$.pipe(
            ofType(esmObjectDetailsActions.load),
            switchMap(({bucketErn, key}) => service.getObject(bucketErn, key).pipe(
                switchMap((object: EsmObject) => service.listObjectAttributes(object.ern).pipe(
                    map((attributes: Record<string, Variant>) =>
                        esmObjectDetailsActions.loadSuccess({object, attributes})),
                )),
                catchError((error: Error) => of(esmObjectDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

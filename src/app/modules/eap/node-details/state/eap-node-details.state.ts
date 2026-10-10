import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {WorkerNodeDetails} from 'euclid-ndk';

import {EapService} from '../../service/eap.service';

/**
 * One worker node, as the details page shows it.
 *
 * One call: `get-node` answers with everything a listing says about a node *and* what it is holding
 * slots for, which is the part the listing leaves off - working that out means walking every pool once
 * per node, and a listing is read to find a host rather than to read what is on it.
 */
export interface EapNodeDetailsState {
    node: WorkerNodeDetails | null;
    loading: boolean;
    error: string | null;
}

export const eapNodeDetailsFeatureKey = 'eap-node-details';

export const eapNodeDetailsActions = {
    load: createAction(`[${eapNodeDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(`[${eapNodeDetailsFeatureKey}] Load success`, props<{node: WorkerNodeDetails}>()),
    loadFailure: createAction(`[${eapNodeDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EapNodeDetailsState = {
    node: null,
    loading: false,
    error: null,
};

export const eapNodeDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different node is being asked for: the page would otherwise show the
    // host it was last about, or why that failed, under the new one's heading.
    on(eapNodeDetailsActions.load, (state: EapNodeDetailsState, {name}): EapNodeDetailsState => {
        const same = state.node?.name === name;
        return {
            node: same ? state.node : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eapNodeDetailsActions.loadSuccess, (state: EapNodeDetailsState, {node}): EapNodeDetailsState => ({
        ...state,
        node: node,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eapNodeDetailsActions.loadFailure, (state: EapNodeDetailsState, {error}): EapNodeDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EapNodeDetailsState>(eapNodeDetailsFeatureKey);

export const eapNodeDetailsSelectors = {
    selectNode: createSelector(selectFeature, state => state?.node ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a node the page has left is of no interest. */
export const loadNode$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EapService);
        return actions$.pipe(
            ofType(eapNodeDetailsActions.load),
            switchMap(({name}) => service.getNode(name).pipe(
                map((node: WorkerNodeDetails) => eapNodeDetailsActions.loadSuccess({node})),
                catchError((error: Error) => of(eapNodeDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

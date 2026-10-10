import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {TransferServer} from 'euclid-ndk';

import {EtsService} from '../../service/ets.service';

/**
 * One transfer server, as the details page shows it.
 *
 * One call: `get-server` answers with the whole definition - who may log in, what they see, and where
 * it listens - so there is no second question to ask.
 */
export interface EtsServerDetailsState {
    server: TransferServer | null;
    loading: boolean;
    error: string | null;
}

export const etsServerDetailsFeatureKey = 'ets-server-details';

export const etsServerDetailsActions = {
    load: createAction(`[${etsServerDetailsFeatureKey}] Load`, props<{serverId: string}>()),
    loadSuccess: createAction(`[${etsServerDetailsFeatureKey}] Load success`, props<{server: TransferServer}>()),
    loadFailure: createAction(`[${etsServerDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EtsServerDetailsState = {
    server: null,
    loading: false,
    error: null,
};

export const etsServerDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different server is being asked for: the page would otherwise show
    // the one it was last about, or why that failed, under the new one's heading.
    on(etsServerDetailsActions.load, (state: EtsServerDetailsState, {serverId}): EtsServerDetailsState => {
        const same = state.server?.serverId === serverId;
        return {
            server: same ? state.server : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(etsServerDetailsActions.loadSuccess, (state: EtsServerDetailsState, {server}): EtsServerDetailsState => ({
        ...state,
        server: server,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(etsServerDetailsActions.loadFailure, (state: EtsServerDetailsState, {error}): EtsServerDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EtsServerDetailsState>(etsServerDetailsFeatureKey);

export const etsServerDetailsSelectors = {
    selectServer: createSelector(selectFeature, state => state?.server ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap` rather than `mergeMap`: the answer for a server the page has left is of no interest. */
export const loadServer$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EtsService);
        return actions$.pipe(
            ofType(etsServerDetailsActions.load),
            switchMap(({serverId}) => service.getServer(serverId).pipe(
                map((server: TransferServer) => etsServerDetailsActions.loadSuccess({server})),
                catchError((error: Error) => of(etsServerDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

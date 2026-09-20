import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, forkJoin, map, of, switchMap} from 'rxjs';
import type {Account, Grant, Namespace} from 'euclid-ndk';

import {EamService} from '../../service/eam.service';

/**
 * One account, as the details page shows it: what it is, what is under it, and what is granted in it.
 *
 * The three are three questions to the server, and the two beside the account are the ones that make an
 * account worth a page: a namespace belongs to exactly one account, and a grant is scoped to one.
 */
export interface EamAccountDetailsState {
    account: Account | null;
    namespaces: Namespace[];
    grants: Grant[];
    loading: boolean;
    error: string | null;
}

export const eamAccountDetailsFeatureKey = 'eam-account-details';

export const eamAccountDetailsActions = {
    load: createAction(`[${eamAccountDetailsFeatureKey}] Load`, props<{accountId: string}>()),
    loadSuccess: createAction(
        `[${eamAccountDetailsFeatureKey}] Load success`,
        props<{account: Account; namespaces: Namespace[]; grants: Grant[]}>(),
    ),
    loadFailure: createAction(`[${eamAccountDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EamAccountDetailsState = {
    account: null,
    namespaces: [],
    grants: [],
    loading: false,
    error: null,
};

export const eamAccountDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different account is being asked for: the page would otherwise show
    // the one it was last about, or why that failed, under the new one's heading.
    on(eamAccountDetailsActions.load, (state: EamAccountDetailsState, {accountId}): EamAccountDetailsState => {
        const same = state.account?.accountId === accountId;
        return {
            account: same ? state.account : null,
            namespaces: same ? state.namespaces : [],
            grants: same ? state.grants : [],
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eamAccountDetailsActions.loadSuccess, (state: EamAccountDetailsState, {account, namespaces, grants}): EamAccountDetailsState => ({
        ...state,
        account: account,
        namespaces: namespaces,
        grants: grants,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eamAccountDetailsActions.loadFailure, (state: EamAccountDetailsState, {error}): EamAccountDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EamAccountDetailsState>(eamAccountDetailsFeatureKey);

export const eamAccountDetailsSelectors = {
    selectAccount: createSelector(selectFeature, state => state?.account ?? null),
    selectNamespaces: createSelector(selectFeature, state => state?.namespaces ?? []),
    selectGrants: createSelector(selectFeature, state => state?.grants ?? []),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * Loading one account, its namespaces and everything granted in it.
 *
 * Side by side: all three are asked by the account ID the route carries, so none waits on another.
 * `switchMap` so that the answers for an account the page has left are dropped rather than arriving
 * after the one it moved to.
 */
export const loadAccount$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EamService);
        return actions$.pipe(
            ofType(eamAccountDetailsActions.load),
            switchMap(({accountId}) => forkJoin({
                account: service.getAccount(accountId),
                namespaces: service.listNamespaces({pageSize: 100}, accountId),
                grants: service.listGrants({accountId: accountId}),
            }).pipe(
                map(({account, namespaces, grants}) => eamAccountDetailsActions.loadSuccess({
                    account: account,
                    namespaces: namespaces.items,
                    grants: grants,
                })),
                catchError((error: Error) => of(eamAccountDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

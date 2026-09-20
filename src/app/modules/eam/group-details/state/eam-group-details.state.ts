import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Grant, UserGroup} from 'euclid-ndk';

import {EamService} from '../../service/eam.service';

/**
 * One user group, as the details page shows it: what it is, and what it has been granted.
 *
 * The members are not a field here because the group carries them - `userIds` comes with it - so unlike
 * the user page, which has to ask what groups somebody is in, this one already has the answer.
 */
export interface EamGroupDetailsState {
    group: UserGroup | null;
    grants: Grant[];
    loading: boolean;
    error: string | null;
}

export const eamGroupDetailsFeatureKey = 'eam-group-details';

export const eamGroupDetailsActions = {
    load: createAction(`[${eamGroupDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(
        `[${eamGroupDetailsFeatureKey}] Load success`,
        props<{group: UserGroup; grants: Grant[]}>(),
    ),
    loadFailure: createAction(`[${eamGroupDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EamGroupDetailsState = {
    group: null,
    grants: [],
    loading: false,
    error: null,
};

export const eamGroupDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different group is being asked for: the page would otherwise show
    // the group it was last about, or why it could not be read, under the new one's heading.
    on(eamGroupDetailsActions.load, (state: EamGroupDetailsState, {name}): EamGroupDetailsState => {
        const same = state.group?.name === name;
        return {
            group: same ? state.group : null,
            grants: same ? state.grants : [],
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eamGroupDetailsActions.loadSuccess, (state: EamGroupDetailsState, {group, grants}): EamGroupDetailsState => ({
        ...state,
        group: group,
        grants: grants,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eamGroupDetailsActions.loadFailure, (state: EamGroupDetailsState, {error}): EamGroupDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EamGroupDetailsState>(eamGroupDetailsFeatureKey);

export const eamGroupDetailsSelectors = {
    selectGroup: createSelector(selectFeature, state => state?.group ?? null),
    selectGrants: createSelector(selectFeature, state => state?.grants ?? []),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * Loading one group and what it has been granted.
 *
 * In sequence rather than side by side: grants are listed by principal, a principal is an ERN, and the
 * route carries a name. So the group is read first for the ERN the second call needs.
 */
export const loadGroup$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EamService);
        return actions$.pipe(
            ofType(eamGroupDetailsActions.load),
            switchMap(({name}) => service.getUserGroup(name).pipe(
                switchMap((group: UserGroup) => service.listGrants({principal: group.ern}).pipe(
                    map((grants: Grant[]) => eamGroupDetailsActions.loadSuccess({group, grants})),
                )),
                catchError((error: Error) => of(eamGroupDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

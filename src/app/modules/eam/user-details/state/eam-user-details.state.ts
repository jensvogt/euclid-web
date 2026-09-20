import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, forkJoin, map, of, switchMap} from 'rxjs';
import type {Grant, User, UserGroup} from 'euclid-ndk';

import {EamService} from '../../service/eam.service';

/**
 * One user, as the details page shows them: who they are, what they have been granted, and what they
 * are a member of.
 *
 * Three fields because they are three questions to the server, and euclid answers them separately on
 * purpose: a grant is its own thing rather than a field of the user since euclid 0.8, and a group holds
 * its members rather than a user holding its groups.
 */
export interface EamUserDetailsState {
    user: User | null;
    grants: Grant[];
    groups: UserGroup[];
    loading: boolean;
    error: string | null;
}

export const eamUserDetailsFeatureKey = 'eam-user-details';

export const eamUserDetailsActions = {
    load: createAction(`[${eamUserDetailsFeatureKey}] Load`, props<{userId: string}>()),
    loadSuccess: createAction(
        `[${eamUserDetailsFeatureKey}] Load success`,
        props<{user: User; grants: Grant[]; groups: UserGroup[]}>(),
    ),
    loadFailure: createAction(`[${eamUserDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EamUserDetailsState = {
    user: null,
    grants: [],
    groups: [],
    loading: false,
    error: null,
};

export const eamUserDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different user is being asked for: the page would otherwise show
    // the user it was last about, or why they could not be read, under the new one's heading.
    on(eamUserDetailsActions.load, (state: EamUserDetailsState, {userId}): EamUserDetailsState => {
        const same = state.user?.userId === userId;
        return {
            user: same ? state.user : null,
            grants: same ? state.grants : [],
            groups: same ? state.groups : [],
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(eamUserDetailsActions.loadSuccess, (state: EamUserDetailsState, {user, grants, groups}): EamUserDetailsState => ({
        ...state,
        user: user,
        grants: grants,
        groups: groups,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(eamUserDetailsActions.loadFailure, (state: EamUserDetailsState, {error}): EamUserDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EamUserDetailsState>(eamUserDetailsFeatureKey);

export const eamUserDetailsSelectors = {
    selectUser: createSelector(selectFeature, state => state?.user ?? null),
    selectGrants: createSelector(selectFeature, state => state?.grants ?? []),
    selectGroups: createSelector(selectFeature, state => state?.groups ?? []),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * Loading one user, their grants and the groups they are in.
 *
 * The user first, because the other two are asked by their ERN and the route only carries an ID. The
 * groups are every group of the account narrowed here rather than by the server: euclid has no "groups
 * this user is in" action, and a group carries its members, so the question is answered from the other
 * side. An installation with thousands of groups would want its own action; one with tens does not.
 */
export const loadUser$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EamService);
        return actions$.pipe(
            ofType(eamUserDetailsActions.load),
            switchMap(({userId}) => service.getUser(userId).pipe(
                switchMap((user: User) => forkJoin({
                    grants: service.listGrants({principal: user.ern}),
                    groups: service.listUserGroups({pageSize: 100}),
                }).pipe(
                    map(({grants, groups}) => eamUserDetailsActions.loadSuccess({
                        user: user,
                        grants: grants,
                        groups: groups.items.filter(group => memberOf(group, user)),
                    })),
                )),
                catchError((error: Error) => of(eamUserDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

/**
 * Whether this user is in this group.
 *
 * Against both the ERN and the ID because `userIds` is named for one and holds the other: the actions
 * that add and remove a member take ERNs, so that is what a group records, but nothing says a server
 * that recorded IDs would be wrong - and a membership missed here would read as one the user does not
 * have.
 */
function memberOf(group: UserGroup, user: User): boolean {
    const members = group.userIds ?? [];
    return members.includes(user.ern) || members.includes(user.userId);
}

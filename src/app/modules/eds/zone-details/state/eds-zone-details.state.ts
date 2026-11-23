import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';

import {EdsService, HostedZone} from '../../service/eds.service';

/**
 * One hosted zone, as the details page shows it.
 *
 * The zone only: its records are a listing of their own and the page reads them beside this, the way the
 * bucket page reads its lifecycle rules. `get-zone` answers with the apex, the default TTL and how many
 * record sets there are, which is the heading rather than the contents.
 */
export interface EdsZoneDetailsState {
    zone: HostedZone | null;
    loading: boolean;
    error: string | null;
}

export const edsZoneDetailsFeatureKey = 'eds-zone-details';

export const edsZoneDetailsActions = {
    load: createAction(`[${edsZoneDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(`[${edsZoneDetailsFeatureKey}] Load success`, props<{zone: HostedZone}>()),
    loadFailure: createAction(`[${edsZoneDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EdsZoneDetailsState = {
    zone: null,
    loading: false,
    error: null,
};

export const edsZoneDetailsReducer = createReducer(
    initialState,

    // Dropped when a different zone is asked for, so the page does not show the last one's apex and
    // record count under the new one's heading.
    on(edsZoneDetailsActions.load, (state: EdsZoneDetailsState, {name}): EdsZoneDetailsState => {
        const same = state.zone?.name === name;
        return {
            zone: same ? state.zone : null,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(edsZoneDetailsActions.loadSuccess, (state: EdsZoneDetailsState, {zone}): EdsZoneDetailsState => ({
        ...state,
        zone: zone,
        loading: false,
        error: null,
    })),
    // The last good answer stays next to the error, as every other slice does it.
    on(edsZoneDetailsActions.loadFailure, (state: EdsZoneDetailsState, {error}): EdsZoneDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EdsZoneDetailsState>(edsZoneDetailsFeatureKey);

export const edsZoneDetailsSelectors = {
    selectZone: createSelector(selectFeature, state => state?.zone ?? null),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** `switchMap`: the answer for a zone the page has left is of no interest. */
export const loadZone$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EdsService);
        return actions$.pipe(
            ofType(edsZoneDetailsActions.load),
            switchMap(({name}) => service.getZone(name).pipe(
                map((zone: HostedZone) => edsZoneDetailsActions.loadSuccess({zone})),
                catchError((error: Error) => of(edsZoneDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

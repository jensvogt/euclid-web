import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, map, of, switchMap} from 'rxjs';
import type {Item, ScanResult, TableDescription} from 'euclid-ndk';

import {EkvService} from '../../service/ekv.service';

/**
 * One table, and a page of what is in it.
 *
 * Two loads rather than one, and deliberately not joined: `get-table` counts the items rather than
 * looking the figure up, so turning to page nine of a scan would re-count the whole table if the two
 * travelled together. The description is read when the page opens; the page of items is read again
 * whenever somebody pages.
 */
export interface EkvTableDetailsState {
    table: TableDescription | null;
    items: Item[];
    /** How many the table holds, as the scan reports it - which is what the paginator's length is. */
    total: number;
    loading: boolean;
    error: string | null;
}

export const ekvTableDetailsFeatureKey = 'ekv-table-details';

export const ekvTableDetailsActions = {
    load: createAction(`[${ekvTableDetailsFeatureKey}] Load`, props<{name: string}>()),
    loadSuccess: createAction(`[${ekvTableDetailsFeatureKey}] Load success`, props<{table: TableDescription}>()),
    scan: createAction(
        `[${ekvTableDetailsFeatureKey}] Scan`,
        props<{name: string; pageSize: number; pageIndex: number}>(),
    ),
    scanSuccess: createAction(
        `[${ekvTableDetailsFeatureKey}] Scan success`,
        props<{items: Item[]; total: number}>(),
    ),
    failure: createAction(`[${ekvTableDetailsFeatureKey}] Failure`, props<{error: string}>()),
};

const initialState: EkvTableDetailsState = {
    table: null,
    items: [],
    total: 0,
    loading: false,
    error: null,
};

export const ekvTableDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different table is being asked for: the page would otherwise show
    // one table's items under another's key.
    on(ekvTableDetailsActions.load, (state: EkvTableDetailsState, {name}): EkvTableDetailsState => {
        const same = state.table?.name === name;
        return {
            table: same ? state.table : null,
            items: same ? state.items : [],
            total: same ? state.total : 0,
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(ekvTableDetailsActions.loadSuccess, (state: EkvTableDetailsState, {table}): EkvTableDetailsState => ({
        ...state,
        table: table,
        loading: false,
        error: null,
    })),
    on(ekvTableDetailsActions.scan, (state: EkvTableDetailsState): EkvTableDetailsState => ({
        ...state,
        loading: true,
    })),
    on(ekvTableDetailsActions.scanSuccess, (state: EkvTableDetailsState, {items, total}): EkvTableDetailsState => ({
        ...state,
        items: items,
        total: total,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(ekvTableDetailsActions.failure, (state: EkvTableDetailsState, {error}): EkvTableDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EkvTableDetailsState>(ekvTableDetailsFeatureKey);

export const ekvTableDetailsSelectors = {
    selectTable: createSelector(selectFeature, state => state?.table ?? null),
    selectItems: createSelector(selectFeature, state => state?.items ?? []),
    selectTotal: createSelector(selectFeature, state => state?.total ?? 0),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/** The table's key and its item count. `switchMap`: the answer for a table the page has left is of no use. */
export const loadTable$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EkvService);
        return actions$.pipe(
            ofType(ekvTableDetailsActions.load),
            switchMap(({name}) => service.getTable(name).pipe(
                map((table: TableDescription) => ekvTableDetailsActions.loadSuccess({table})),
                catchError((error: Error) => of(ekvTableDetailsActions.failure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

/**
 * One page of the table's items.
 *
 * A scan rather than a query, because a page showing what is in a table has no key to query on: it walks
 * the table, and `total` is how many it walked past. Expensive by nature on a large table, as it is in
 * any key-value store - which is why this page asks only when opened or when somebody pages.
 */
export const scanTable$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EkvService);
        return actions$.pipe(
            ofType(ekvTableDetailsActions.scan),
            switchMap(({name, pageSize, pageIndex}) => service.scan(name, pageSize, pageIndex).pipe(
                map((result: ScanResult) => ekvTableDetailsActions.scanSuccess({
                    items: result.items ?? [],
                    total: result.total ?? 0,
                })),
                catchError((error: Error) => of(ekvTableDetailsActions.failure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

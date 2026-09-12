import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {
    ActionCreator,
    ActionReducer,
    createAction,
    createFeatureSelector,
    createReducer,
    createSelector,
    on,
    props,
} from '@ngrx/store';
import {catchError, map, Observable, of, switchMap} from 'rxjs';

import {Page} from '../../services/euclid-http.service';
import {SortColumn} from '../sorting/sorting.component';

/** The paging, ordering and narrowing a list view is currently showing. */
export interface ListQueryProps {
    prefix: string;
    pageSize: number;
    pageIndex: number;
    sortColumn: string;
    sortDirection: 'asc' | 'desc';
    /**
     * The ERN of the thing being listed into, for the views that list a resource's contents.
     *
     * A queue's messages and a bucket's objects are pages like any other, but of one parent rather than of
     * the namespace - and that parent comes from the route, not from the store. Carrying it on the action is
     * what lets the same feature factory serve both kinds of listing; it is the empty string for the
     * listings that have no parent.
     */
    parent: string;
}

/** What a list view holds: the page it is showing, and what it asked for. */
export interface ListState<T> {
    items: T[];
    total: number;
    prefix: string;
    pageSize: number;
    pageIndex: number;
    sortColumn: SortColumn;
    loading: boolean;
    error: unknown;
}

/** The actions, reducer and selectors of one list view, as {@link createListFeature} builds them. */
export interface ListFeature<T> {
    featureKey: string;
    /** How the list is ordered until the user says otherwise. */
    defaultSort: SortColumn;
    actions: {
        load: ActionCreator<string, (props: ListQueryProps) => ListQueryProps & {type: string}>;
        loadSuccess: ActionCreator<string, (props: {page: Page<T>}) => {page: Page<T>; type: string}>;
        loadFailure: ActionCreator<string, (props: {error: string}) => {error: string; type: string}>;
    };
    reducer: ActionReducer<ListState<T>>;
    selectors: {
        selectItems: (state: object) => T[];
        selectTotal: (state: object) => number;
        selectPrefix: (state: object) => string;
        selectPageSize: (state: object) => number;
        selectPageIndex: (state: object) => number;
        selectSortColumn: (state: object) => SortColumn;
        selectLoading: (state: object) => boolean;
        selectError: (state: object) => unknown;
    };
}

/**
 * One paged list view's store slice.
 *
 * Built rather than written out nine times over, because every one of euclid's listings is the same
 * listing: a prefix, a page, a sort column, and an answer of `{total, <things>}`. awsmock-ui writes four
 * state files per list because each of its services answers differently; euclid does not, and four files
 * of identical boilerplate per module would only be nine chances to get one of them subtly wrong.
 *
 * What is *not* generic stays per module - the service call, the columns, the actions in the row menu -
 * and a detail view, which has a shape of its own rather than a page, gets its own explicit state.
 */
export function createListFeature<T>(featureKey: string, defaultSort: SortColumn): ListFeature<T> {

    const actions = {
        load: createAction(`[${featureKey}] Load`, props<ListQueryProps>()),
        loadSuccess: createAction(`[${featureKey}] Load success`, props<{page: Page<T>}>()),
        loadFailure: createAction(`[${featureKey}] Load failure`, props<{error: string}>()),
    };

    const initialState: ListState<T> = {
        items: [],
        total: 0,
        prefix: '',
        pageSize: 10,
        pageIndex: 0,
        sortColumn: defaultSort,
        loading: false,
        error: null,
    };

    const reducer = createReducer(
        initialState,

        on(actions.load, (state: ListState<T>, query): ListState<T> => ({
            ...state,
            prefix: query.prefix,
            pageSize: query.pageSize,
            pageIndex: query.pageIndex,
            sortColumn: {column: query.sortColumn, direction: query.sortDirection},
            loading: true,
        })),
        on(actions.loadSuccess, (state: ListState<T>, {page}): ListState<T> => ({
            ...state,
            items: page.items,
            total: page.total,
            loading: false,
            error: null,
        })),
        // The page is left alone on a failure rather than blanked: a reload that fails should show what
        // was there a moment ago next to the error, not an empty table that looks like an empty account.
        on(actions.loadFailure, (state: ListState<T>, {error}): ListState<T> => ({
            ...state,
            loading: false,
            error: error,
        })),
    );

    const selectFeature = createFeatureSelector<ListState<T>>(featureKey);

    return {
        featureKey: featureKey,
        defaultSort: defaultSort,
        actions: actions,
        reducer: reducer,
        selectors: {
            selectItems: createSelector(selectFeature, state => state?.items ?? []),
            selectTotal: createSelector(selectFeature, state => state?.total ?? 0),
            selectPrefix: createSelector(selectFeature, state => state?.prefix ?? ''),
            selectPageSize: createSelector(selectFeature, state => state?.pageSize ?? 10),
            selectPageIndex: createSelector(selectFeature, state => state?.pageIndex ?? 0),
            selectSortColumn: createSelector(selectFeature, state => state?.sortColumn ?? defaultSort),
            selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
            selectError: createSelector(selectFeature, state => state?.error ?? null),
        },
    };
}

/**
 * The effect that turns a {@link ListFeature}'s load action into the module's own listing call.
 *
 * `loader` is called inside the effect's injection context, which is what lets it reach for the module
 * service with `inject()`. `switchMap` rather than `mergeMap`: when a user pages twice quickly, the answer
 * to the page they have left is of no interest, and letting it arrive second would show it.
 */
export function createListEffect<T>(
    feature: ListFeature<T>,
    loader: () => (query: ListQueryProps) => Observable<Page<T>>,
) {
    return createEffect(
        () => {
            const actions$ = inject(Actions);
            const load = loader();
            return actions$.pipe(
                ofType(feature.actions.load),
                switchMap((query: ListQueryProps) => load(query).pipe(
                    map((page: Page<T>) => feature.actions.loadSuccess({page})),
                    catchError((error: Error) => of(feature.actions.loadFailure({error: error.message}))),
                )),
            );
        },
        {functional: true},
    );
}

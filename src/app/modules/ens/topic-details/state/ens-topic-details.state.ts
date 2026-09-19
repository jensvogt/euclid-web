import {inject} from '@angular/core';
import {Actions, createEffect, ofType} from '@ngrx/effects';
import {createAction, createFeatureSelector, createReducer, createSelector, on, props} from '@ngrx/store';
import {catchError, forkJoin, map, of, switchMap} from 'rxjs';
import type {Subscription, Topic} from 'euclid-ndk';

import {EnsService} from '../../service/ens.service';

/**
 * One topic, as the details page shows it: what it is, and who is listening.
 *
 * Written out rather than built by {@link import("../../../../shared/list/list-feature.js").createListFeature},
 * for the reason the other detail slices are - there is one thing here rather than a page of them - and
 * with one addition: a topic's subscriptions are a second question to the server, so they are a second
 * field rather than something read off the topic.
 */
export interface EnsTopicDetailsState {
    topic: Topic | null;
    subscriptions: Subscription[];
    loading: boolean;
    error: string | null;
}

export const ensTopicDetailsFeatureKey = 'ens-topic-details';

export const ensTopicDetailsActions = {
    load: createAction(`[${ensTopicDetailsFeatureKey}] Load`, props<{ern: string}>()),
    loadSuccess: createAction(
        `[${ensTopicDetailsFeatureKey}] Load success`,
        props<{topic: Topic; subscriptions: Subscription[]}>(),
    ),
    loadFailure: createAction(`[${ensTopicDetailsFeatureKey}] Load failure`, props<{error: string}>()),
};

const initialState: EnsTopicDetailsState = {
    topic: null,
    subscriptions: [],
    loading: false,
    error: null,
};

export const ensTopicDetailsReducer = createReducer(
    initialState,

    // What is held is dropped when a different topic is being asked for: the page would otherwise show
    // the topic it was last about, or why that one could not be read, under the new one's heading.
    on(ensTopicDetailsActions.load, (state: EnsTopicDetailsState, {ern}): EnsTopicDetailsState => {
        const same = state.topic?.ern === ern;
        return {
            topic: same ? state.topic : null,
            subscriptions: same ? state.subscriptions : [],
            error: same ? state.error : null,
            loading: true,
        };
    }),
    on(ensTopicDetailsActions.loadSuccess, (state: EnsTopicDetailsState, {topic, subscriptions}): EnsTopicDetailsState => ({
        ...state,
        topic: topic,
        subscriptions: subscriptions,
        loading: false,
        error: null,
    })),
    // What was read a moment ago is left in place on a failure, as the list slices do it: a reload that
    // fails should show the last good answer next to the error rather than an empty page.
    on(ensTopicDetailsActions.loadFailure, (state: EnsTopicDetailsState, {error}): EnsTopicDetailsState => ({
        ...state,
        loading: false,
        error: error,
    })),
);

const selectFeature = createFeatureSelector<EnsTopicDetailsState>(ensTopicDetailsFeatureKey);

export const ensTopicDetailsSelectors = {
    selectTopic: createSelector(selectFeature, state => state?.topic ?? null),
    selectSubscriptions: createSelector(selectFeature, state => state?.subscriptions ?? []),
    selectLoading: createSelector(selectFeature, state => state?.loading ?? false),
    selectError: createSelector(selectFeature, state => state?.error ?? null),
};

/**
 * Loading one topic and its subscriptions.
 *
 * Side by side rather than in sequence: both are asked for by the topic's own ERN, which the route
 * already supplies, so neither waits on the other. `switchMap` so that the answers for a topic the page
 * has left are dropped rather than arriving after the one it moved to.
 */
export const loadTopic$ = createEffect(
    () => {
        const actions$ = inject(Actions);
        const service = inject(EnsService);
        return actions$.pipe(
            ofType(ensTopicDetailsActions.load),
            switchMap(({ern}) => forkJoin({
                topic: service.getTopic(ern),
                subscriptions: service.listSubscriptions(ern),
            }).pipe(
                map(({topic, subscriptions}) => ensTopicDetailsActions.loadSuccess({topic, subscriptions})),
                catchError((error: Error) => of(ensTopicDetailsActions.loadFailure({error: error.message}))),
            )),
        );
    },
    {functional: true},
);

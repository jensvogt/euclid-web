import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    ensTopicDetailsFeatureKey,
    ensTopicDetailsReducer,
    loadTopic$,
} from './topic-details/state/ens-topic-details.state';
import {ensTopicListFeature, loadTopics$} from './topic-list/state/ens-topic-list.state';
import {ensMessageListFeature, loadMessages$} from './message-list/state/ens-message-list.state';

export const ensRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ensTopicListFeature.featureKey, ensTopicListFeature.reducer),
            provideState(ensMessageListFeature.featureKey, ensMessageListFeature.reducer),
            provideState(ensTopicDetailsFeatureKey, ensTopicDetailsReducer),
            provideEffects({loadTopics$, loadMessages$, loadTopic$}),
        ],
        children: [
            {
                path: '',
                title: 'ENS Topics',
                loadComponent: () => import('./topic-list/ens-topic-list.component').then(m => m.EnsTopicListComponent),
            },
            {
                path: 'topic/:topicErn',
                title: 'ENS Topic',
                loadComponent: () => import('./topic-details/ens-topic-details.component').then(m => m.EnsTopicDetailsComponent),
            },
            {
                path: 'messages/:topicErn',
                title: 'ENS Messages',
                loadComponent: () => import('./message-list/ens-message-list.component').then(m => m.EnsMessageListComponent),
            },
        ],
    },
];

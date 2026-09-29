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
import {
    ensMessageDetailsFeatureKey,
    ensMessageDetailsReducer,
    loadMessage$,
} from './message-details/state/ens-message-details.state';

export const ensRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ensTopicListFeature.featureKey, ensTopicListFeature.reducer),
            provideState(ensMessageListFeature.featureKey, ensMessageListFeature.reducer),
            provideState(ensTopicDetailsFeatureKey, ensTopicDetailsReducer),
            provideState(ensMessageDetailsFeatureKey, ensMessageDetailsReducer),
            provideEffects({loadTopics$, loadMessages$, loadTopic$, loadMessage$}),
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
            // The topic as well as the message, though `get-message` needs only the ID: the page links back
            // to the listing it was opened from and to the topic itself, and neither address can be built
            // from a message that has not been read yet.
            {
                path: 'messages/:topicErn/:messageId',
                title: 'ENS Message',
                loadComponent: () => import('./message-details/ens-message-details.component').then(m => m.EnsMessageDetailsComponent),
            },
        ],
    },
];

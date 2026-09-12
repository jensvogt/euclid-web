import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {ensTopicListFeature, loadTopics$} from './topic-list/state/ens-topic-list.state';
import {ensMessageListFeature, loadMessages$} from './message-list/state/ens-message-list.state';

export const ensRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ensTopicListFeature.featureKey, ensTopicListFeature.reducer),
            provideState(ensMessageListFeature.featureKey, ensMessageListFeature.reducer),
            provideEffects({loadTopics$, loadMessages$}),
        ],
        children: [
            {
                path: '',
                title: 'ENS Topics',
                loadComponent: () => import('./topic-list/ens-topic-list.component').then(m => m.EnsTopicListComponent),
            },
            {
                path: 'messages/:topicErn',
                title: 'ENS Messages',
                loadComponent: () => import('./message-list/ens-message-list.component').then(m => m.EnsMessageListComponent),
            },
        ],
    },
];

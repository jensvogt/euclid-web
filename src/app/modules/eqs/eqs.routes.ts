import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    eqsQueueDetailsFeatureKey,
    eqsQueueDetailsReducer,
    loadQueue$,
} from './queue-details/state/eqs-queue-details.state';
import {eqsQueueListFeature, loadQueues$} from './queue-list/state/eqs-queue-list.state';
import {eqsMessageListFeature, loadMessages$} from './message-list/state/eqs-message-list.state';
import {
    eqsMessageDetailsFeatureKey,
    eqsMessageDetailsReducer,
    loadMessage$,
} from './message-details/state/eqs-message-details.state';

/**
 * EQS's routes, with its store slices provided at the route rather than globally.
 *
 * A slice that arrives with the route leaves with it, so nothing of a module the user never opened is in the
 * store - which is also what makes the lazy `loadComponent` below worth anything.
 */
export const eqsRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eqsQueueListFeature.featureKey, eqsQueueListFeature.reducer),
            provideState(eqsMessageListFeature.featureKey, eqsMessageListFeature.reducer),
            provideState(eqsQueueDetailsFeatureKey, eqsQueueDetailsReducer),
            provideState(eqsMessageDetailsFeatureKey, eqsMessageDetailsReducer),
            provideEffects({loadQueues$, loadMessages$, loadQueue$, loadMessage$}),
        ],
        children: [
            {
                path: '',
                title: 'EQS Queues',
                loadComponent: () => import('./queue-list/eqs-queue-list.component').then(m => m.EqsQueueListComponent),
            },
            {
                path: 'queue/:queueErn',
                title: 'EQS Queue',
                loadComponent: () => import('./queue-details/eqs-queue-details.component').then(m => m.EqsQueueDetailsComponent),
            },
            {
                path: 'messages/:queueErn',
                title: 'EQS Messages',
                loadComponent: () => import('./message-list/eqs-message-list.component').then(m => m.EqsMessageListComponent),
            },
            // The queue as well as the message, though `get-message` needs only the ID: the page links back
            // to the listing it was opened from and to the queue itself, and neither address can be built
            // from a message that has not been read yet.
            {
                path: 'messages/:queueErn/:messageId',
                title: 'EQS Message',
                loadComponent: () => import('./message-details/eqs-message-details.component').then(m => m.EqsMessageDetailsComponent),
            },
        ],
    },
];

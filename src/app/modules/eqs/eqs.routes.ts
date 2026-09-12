import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {eqsQueueListFeature, loadQueues$} from './queue-list/state/eqs-queue-list.state';
import {eqsMessageListFeature, loadMessages$} from './message-list/state/eqs-message-list.state';

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
            provideEffects({loadQueues$, loadMessages$}),
        ],
        children: [
            {
                path: '',
                title: 'EQS Queues',
                loadComponent: () => import('./queue-list/eqs-queue-list.component').then(m => m.EqsQueueListComponent),
            },
            {
                path: 'messages/:queueErn',
                title: 'EQS Messages',
                loadComponent: () => import('./message-list/eqs-message-list.component').then(m => m.EqsMessageListComponent),
            },
        ],
    },
];

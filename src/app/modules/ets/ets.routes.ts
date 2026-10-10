import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    etsServerDetailsFeatureKey,
    etsServerDetailsReducer,
    loadServer$,
} from './server-details/state/ets-server-details.state';
import {etsServerListFeature, loadServers$} from './server-list/state/ets-server-list.state';

export const etsRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(etsServerListFeature.featureKey, etsServerListFeature.reducer),
            provideState(etsServerDetailsFeatureKey, etsServerDetailsReducer),
            provideEffects({loadServers$, loadServer$}),
        ],
        children: [
            {
                path: '',
                title: 'ETS Transfer Servers',
                loadComponent: () => import('./server-list/ets-server-list.component').then(m => m.EtsServerListComponent),
            },
            // By ID, which is what every ETS action takes.
            {
                path: 'server/:serverId',
                title: 'ETS Transfer Server',
                loadComponent: () => import('./server-details/ets-server-details.component').then(m => m.EtsServerDetailsComponent),
            },
        ],
    },
];

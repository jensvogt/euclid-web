import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {etsServerListFeature, loadServers$} from './server-list/state/ets-server-list.state';

export const etsRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(etsServerListFeature.featureKey, etsServerListFeature.reducer),
            provideEffects({loadServers$}),
        ],
        children: [
            {
                path: '',
                title: 'ETS Transfer Servers',
                loadComponent: () => import('./server-list/ets-server-list.component').then(m => m.EtsServerListComponent),
            },
        ],
    },
];

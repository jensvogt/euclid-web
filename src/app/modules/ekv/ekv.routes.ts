import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    ekvTableDetailsFeatureKey,
    ekvTableDetailsReducer,
    loadTable$,
    scanTable$,
} from './table-details/state/ekv-table-details.state';
import {ekvTableListFeature, loadTables$} from './table-list/state/ekv-table-list.state';

export const ekvRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ekvTableListFeature.featureKey, ekvTableListFeature.reducer),
            provideState(ekvTableDetailsFeatureKey, ekvTableDetailsReducer),
            provideEffects({loadTables$, loadTable$, scanTable$}),
        ],
        children: [
            {
                path: '',
                title: 'EKV Tables',
                loadComponent: () => import('./table-list/ekv-table-list.component').then(m => m.EkvTableListComponent),
            },
            // By name, which is what every EKV action takes.
            {
                path: 'table/:name',
                title: 'EKV Table',
                loadComponent: () => import('./table-details/ekv-table-details.component').then(m => m.EkvTableDetailsComponent),
            },
        ],
    },
];

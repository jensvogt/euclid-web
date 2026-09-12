import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {ekvTableListFeature, loadTables$} from './table-list/state/ekv-table-list.state';

export const ekvRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ekvTableListFeature.featureKey, ekvTableListFeature.reducer),
            provideEffects({loadTables$}),
        ],
        children: [
            {
                path: '',
                title: 'EKV Tables',
                loadComponent: () => import('./table-list/ekv-table-list.component').then(m => m.EkvTableListComponent),
            },
        ],
    },
];

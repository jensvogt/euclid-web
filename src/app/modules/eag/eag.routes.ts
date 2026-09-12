import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {eagRouteListFeature, loadRoutes$} from './route-list/state/eag-route-list.state';
import {eagListenerListFeature, loadListeners$} from './listener-list/state/eag-listener-list.state';

export const eagRouteRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eagRouteListFeature.featureKey, eagRouteListFeature.reducer),
            provideEffects({loadRoutes$}),
        ],
        children: [
            {
                path: '',
                title: 'EAG Routes',
                loadComponent: () => import('./route-list/eag-route-list.component').then(m => m.EagRouteListComponent),
            },
        ],
    },
];

export const eagListenerRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eagListenerListFeature.featureKey, eagListenerListFeature.reducer),
            provideEffects({loadListeners$}),
        ],
        children: [
            {
                path: '',
                title: 'EAG Listeners',
                loadComponent: () => import('./listener-list/eag-listener-list.component').then(m => m.EagListenerListComponent),
            },
        ],
    },
];

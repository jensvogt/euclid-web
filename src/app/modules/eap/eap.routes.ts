import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {eapApplicationListFeature, loadApplications$} from './application-list/state/eap-application-list.state';

export const eapRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eapApplicationListFeature.featureKey, eapApplicationListFeature.reducer),
            provideEffects({loadApplications$}),
        ],
        children: [
            {
                path: '',
                title: 'EAP Applications',
                loadComponent: () => import('./application-list/eap-application-list.component').then(m => m.EapApplicationListComponent),
            },
        ],
    },
];

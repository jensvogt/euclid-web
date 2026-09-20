import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    eapApplicationDetailsFeatureKey,
    eapApplicationDetailsReducer,
    loadApplication$,
} from './application-details/state/eap-application-details.state';
import {eapApplicationListFeature, loadApplications$} from './application-list/state/eap-application-list.state';

export const eapRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eapApplicationListFeature.featureKey, eapApplicationListFeature.reducer),
            provideState(eapApplicationDetailsFeatureKey, eapApplicationDetailsReducer),
            provideEffects({loadApplications$, loadApplication$}),
        ],
        children: [
            {
                path: '',
                title: 'EAP Applications',
                loadComponent: () => import('./application-list/eap-application-list.component').then(m => m.EapApplicationListComponent),
            },
            // By application ID, which is what every other EAP action resolves an application by.
            {
                path: 'application/:applicationId',
                title: 'EAP Application',
                loadComponent: () => import('./application-details/eap-application-details.component').then(m => m.EapApplicationDetailsComponent),
            },
        ],
    },
];

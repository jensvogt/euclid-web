import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    eapApplicationDetailsFeatureKey,
    eapApplicationDetailsReducer,
    loadApplication$,
} from './application-details/state/eap-application-details.state';
import {eapApplicationListFeature, loadApplications$} from './application-list/state/eap-application-list.state';
import {
    eapNodeDetailsFeatureKey,
    eapNodeDetailsReducer,
    loadNode$,
} from './node-details/state/eap-node-details.state';
import {eapNodeListFeature, loadNodes$} from './node-list/state/eap-node-list.state';

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

/**
 * The nodes, on their own route rather than as a tab of the applications.
 *
 * Two separate things an administrator goes looking for - what is deployed, and what it is deployed on -
 * and a flat address per list is what lets the dashboard and the toolbar link straight to each, the way
 * EAM's five lists do.
 */
export const eapNodeRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eapNodeListFeature.featureKey, eapNodeListFeature.reducer),
            provideState(eapNodeDetailsFeatureKey, eapNodeDetailsReducer),
            provideEffects({loadNodes$, loadNode$}),
        ],
        children: [
            {
                path: '',
                title: 'EAP Worker Nodes',
                loadComponent: () => import('./node-list/eap-node-list.component').then(m => m.EapNodeListComponent),
            },
            // By name, which is what `get-node`, `drain-node` and `delete-node` all take.
            {
                path: 'node/:name',
                title: 'EAP Worker Node',
                loadComponent: () => import('./node-details/eap-node-details.component').then(m => m.EapNodeDetailsComponent),
            },
        ],
    },
];

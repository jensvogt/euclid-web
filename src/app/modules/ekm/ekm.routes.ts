import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    ekmKeyDetailsFeatureKey,
    ekmKeyDetailsReducer,
    loadKey$,
} from './key-details/state/ekm-key-details.state';
import {ekmKeyListFeature, loadKeys$} from './key-list/state/ekm-key-list.state';
import {ekmCertificateListFeature, loadCertificates$} from './certificate-list/state/ekm-certificate-list.state';

export const ekmKeyRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ekmKeyListFeature.featureKey, ekmKeyListFeature.reducer),
            provideState(ekmKeyDetailsFeatureKey, ekmKeyDetailsReducer),
            provideEffects({loadKeys$, loadKey$}),
        ],
        children: [
            {
                path: '',
                title: 'EKM Keys',
                loadComponent: () => import('./key-list/ekm-key-list.component').then(m => m.EkmKeyListComponent),
            },
            // By name, which is the ID the server minted and what `get-key` and `delete-key` both take.
            {
                path: 'key/:name',
                title: 'EKM Key',
                loadComponent: () => import('./key-details/ekm-key-details.component').then(m => m.EkmKeyDetailsComponent),
            },
        ],
    },
];

export const ekmCertificateRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ekmCertificateListFeature.featureKey, ekmCertificateListFeature.reducer),
            provideEffects({loadCertificates$}),
        ],
        children: [
            {
                path: '',
                title: 'EKM Certificates',
                loadComponent: () => import('./certificate-list/ekm-certificate-list.component').then(m => m.EkmCertificateListComponent),
            },
        ],
    },
];

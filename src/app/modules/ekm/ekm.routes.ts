import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {ekmKeyListFeature, loadKeys$} from './key-list/state/ekm-key-list.state';
import {ekmCertificateListFeature, loadCertificates$} from './certificate-list/state/ekm-certificate-list.state';

export const ekmKeyRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(ekmKeyListFeature.featureKey, ekmKeyListFeature.reducer),
            provideEffects({loadKeys$}),
        ],
        children: [
            {
                path: '',
                title: 'EKM Keys',
                loadComponent: () => import('./key-list/ekm-key-list.component').then(m => m.EkmKeyListComponent),
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

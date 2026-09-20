import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    essSecretDetailsFeatureKey,
    essSecretDetailsReducer,
    loadSecret$,
} from './secret-details/state/ess-secret-details.state';
import {essSecretListFeature, loadSecrets$} from './secret-list/state/ess-secret-list.state';

export const essRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(essSecretListFeature.featureKey, essSecretListFeature.reducer),
            provideState(essSecretDetailsFeatureKey, essSecretDetailsReducer),
            provideEffects({loadSecrets$, loadSecret$}),
        ],
        children: [
            {
                path: '',
                title: 'ESS Secrets',
                loadComponent: () => import('./secret-list/ess-secret-list.component').then(m => m.EssSecretListComponent),
            },
            // By name, which is what every ESS action takes - including the one that decrypts.
            {
                path: 'secret/:name',
                title: 'ESS Secret',
                loadComponent: () => import('./secret-details/ess-secret-details.component').then(m => m.EssSecretDetailsComponent),
            },
        ],
    },
];

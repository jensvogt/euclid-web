import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {essSecretListFeature, loadSecrets$} from './secret-list/state/ess-secret-list.state';

export const essRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(essSecretListFeature.featureKey, essSecretListFeature.reducer),
            provideEffects({loadSecrets$}),
        ],
        children: [
            {
                path: '',
                title: 'ESS Secrets',
                loadComponent: () => import('./secret-list/ess-secret-list.component').then(m => m.EssSecretListComponent),
            },
        ],
    },
];

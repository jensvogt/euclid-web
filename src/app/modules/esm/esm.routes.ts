import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {esmBucketListFeature, loadBuckets$} from './bucket-list/state/esm-bucket-list.state';
import {esmObjectListFeature, loadObjects$} from './object-list/state/esm-object-list.state';

export const esmRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(esmBucketListFeature.featureKey, esmBucketListFeature.reducer),
            provideState(esmObjectListFeature.featureKey, esmObjectListFeature.reducer),
            provideEffects({loadBuckets$, loadObjects$}),
        ],
        children: [
            {
                path: '',
                title: 'ESM Buckets',
                loadComponent: () => import('./bucket-list/esm-bucket-list.component').then(m => m.EsmBucketListComponent),
            },
            {
                path: 'objects/:bucketErn',
                title: 'ESM Objects',
                loadComponent: () => import('./object-list/esm-object-list.component').then(m => m.EsmObjectListComponent),
            },
        ],
    },
];

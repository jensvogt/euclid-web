import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {
    esmBucketDetailsFeatureKey,
    esmBucketDetailsReducer,
    loadBucket$,
} from './bucket-details/state/esm-bucket-details.state';
import {esmBucketListFeature, loadBuckets$} from './bucket-list/state/esm-bucket-list.state';
import {
    esmObjectDetailsFeatureKey,
    esmObjectDetailsReducer,
    loadObject$,
} from './object-details/state/esm-object-details.state';
import {esmObjectListFeature, loadObjects$} from './object-list/state/esm-object-list.state';

export const esmRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(esmBucketListFeature.featureKey, esmBucketListFeature.reducer),
            provideState(esmObjectListFeature.featureKey, esmObjectListFeature.reducer),
            provideState(esmBucketDetailsFeatureKey, esmBucketDetailsReducer),
            provideState(esmObjectDetailsFeatureKey, esmObjectDetailsReducer),
            provideEffects({loadBuckets$, loadObjects$, loadBucket$, loadObject$}),
        ],
        children: [
            {
                path: '',
                title: 'ESM Buckets',
                loadComponent: () => import('./bucket-list/esm-bucket-list.component').then(m => m.EsmBucketListComponent),
            },
            {
                path: 'bucket/:bucketErn',
                title: 'ESM Bucket',
                loadComponent: () => import('./bucket-details/esm-bucket-details.component').then(m => m.EsmBucketDetailsComponent),
            },
            {
                path: 'objects/:bucketErn',
                title: 'ESM Objects',
                loadComponent: () => import('./object-list/esm-object-list.component').then(m => m.EsmObjectListComponent),
            },
            // One segment more than the listing it belongs to. A key holds slashes and the router encodes
            // them, so this stays one segment however deep the "directory" a key describes.
            {
                path: 'objects/:bucketErn/:key',
                title: 'ESM Object',
                loadComponent: () => import('./object-details/esm-object-details.component').then(m => m.EsmObjectDetailsComponent),
            },
        ],
    },
];

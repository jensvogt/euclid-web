import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {edsZoneDetailsFeatureKey, edsZoneDetailsReducer, loadZone$} from './zone-details/state/eds-zone-details.state';
import {edsZoneListFeature, loadZones$} from './zone-list/state/eds-zone-list.state';

export const edsRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(edsZoneListFeature.featureKey, edsZoneListFeature.reducer),
            provideState(edsZoneDetailsFeatureKey, edsZoneDetailsReducer),
            provideEffects({loadZones$, loadZone$}),
        ],
        children: [
            {
                path: '',
                title: 'EDS Zones',
                loadComponent: () => import('./zone-list/eds-zone-list.component').then(m => m.EdsZoneListComponent),
            },
            // By apex, which is what every EDS zone action takes. A name with dots is one segment.
            {
                path: 'zone/:name',
                title: 'EDS Zone',
                loadComponent: () => import('./zone-details/eds-zone-details.component').then(m => m.EdsZoneDetailsComponent),
            },
        ],
    },
];

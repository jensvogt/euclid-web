import {Routes} from '@angular/router';
import {provideEffects} from '@ngrx/effects';
import {provideState} from '@ngrx/store';

import {eamUserListFeature, loadUsers$} from './user-list/state/eam-user-list.state';
import {eamGroupListFeature, loadGroups$} from './group-list/state/eam-group-list.state';
import {eamAccountListFeature, loadAccounts$} from './account-list/state/eam-account-list.state';
import {eamNamespaceListFeature, loadNamespaces$} from './namespace-list/state/eam-namespace-list.state';
import {eamAccessKeyListFeature, loadAccessKeys$} from './access-key-list/state/eam-access-key-list.state';

/**
 * EAM's five list views, each with its own route and its own store slice.
 *
 * Five entry points rather than one with tabs, because they are five separate things an administrator goes
 * looking for - and because a flat address per list is what lets the dashboard link straight to each.
 */
export const eamUserRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eamUserListFeature.featureKey, eamUserListFeature.reducer),
            provideEffects({loadUsers$}),
        ],
        children: [
            {
                path: '',
                title: 'EAM Users',
                loadComponent: () => import('./user-list/eam-user-list.component').then(m => m.EamUserListComponent),
            },
        ],
    },
];

export const eamGroupRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eamGroupListFeature.featureKey, eamGroupListFeature.reducer),
            provideEffects({loadGroups$}),
        ],
        children: [
            {
                path: '',
                title: 'EAM User Groups',
                loadComponent: () => import('./group-list/eam-group-list.component').then(m => m.EamGroupListComponent),
            },
        ],
    },
];

export const eamAccountRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eamAccountListFeature.featureKey, eamAccountListFeature.reducer),
            provideEffects({loadAccounts$}),
        ],
        children: [
            {
                path: '',
                title: 'EAM Accounts',
                loadComponent: () => import('./account-list/eam-account-list.component').then(m => m.EamAccountListComponent),
            },
        ],
    },
];

export const eamNamespaceRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eamNamespaceListFeature.featureKey, eamNamespaceListFeature.reducer),
            provideEffects({loadNamespaces$}),
        ],
        children: [
            {
                path: '',
                title: 'EAM Namespaces',
                loadComponent: () => import('./namespace-list/eam-namespace-list.component').then(m => m.EamNamespaceListComponent),
            },
        ],
    },
];

export const eamAccessKeyRoutes: Routes = [
    {
        path: '',
        providers: [
            provideState(eamAccessKeyListFeature.featureKey, eamAccessKeyListFeature.reducer),
            provideEffects({loadAccessKeys$}),
        ],
        children: [
            {
                path: '',
                title: 'EAM Access Keys',
                loadComponent: () => import('./access-key-list/eam-access-key-list.component').then(m => m.EamAccessKeyListComponent),
            },
        ],
    },
];

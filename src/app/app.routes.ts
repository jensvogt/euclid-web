import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {BrowserModule} from '@angular/platform-browser';

import {authGuard} from './services/auth.guard';
import {NotFoundComponent} from './modules/not-found/not-found.component';

/**
 * Every route in the app.
 *
 * Each module is lazy and brings its own store slices with it - see any `*.routes.ts` - so the bundle a user
 * downloads is the shell plus the modules they actually open, and the store holds nothing of the rest.
 *
 * Paths are named `<module>-<thing>-list`, which is awsmock-ui's convention (`sqs-queue-list`) carried over:
 * a flat address per list rather than a hierarchy, so the toolbar's module box and the dashboard cards can
 * both link straight to one.
 */
export const routes: Routes = [
    {
        path: '',
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: '/dashboard',
            },
            {
                path: 'login',
                title: 'Sign in',
                loadComponent: () => import('./modules/login/login.component').then(m => m.LoginComponent),
            },
            {
                path: 'dashboard',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/dashboard/dashboard.module').then(m => m.DashboardModule),
            },
            //=========================================================================
            // EAM - access management
            //=========================================================================
            {
                path: 'eam-user-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eam/eam.routes').then(m => m.eamUserRoutes),
            },
            {
                path: 'eam-group-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eam/eam.routes').then(m => m.eamGroupRoutes),
            },
            {
                path: 'eam-account-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eam/eam.routes').then(m => m.eamAccountRoutes),
            },
            {
                path: 'eam-namespace-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eam/eam.routes').then(m => m.eamNamespaceRoutes),
            },
            {
                path: 'eam-access-key-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eam/eam.routes').then(m => m.eamAccessKeyRoutes),
            },
            //=========================================================================
            // ESM - storage
            //=========================================================================
            {
                path: 'esm-bucket-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/esm/esm.routes').then(m => m.esmRoutes),
            },
            //=========================================================================
            // EQS - queues
            //=========================================================================
            {
                path: 'eqs-queue-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eqs/eqs.routes').then(m => m.eqsRoutes),
            },
            //=========================================================================
            // ENS - notifications
            //=========================================================================
            {
                path: 'ens-topic-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/ens/ens.routes').then(m => m.ensRoutes),
            },
            //=========================================================================
            // EKM - key management
            //=========================================================================
            {
                path: 'ekm-key-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/ekm/ekm.routes').then(m => m.ekmKeyRoutes),
            },
            {
                path: 'ekm-certificate-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/ekm/ekm.routes').then(m => m.ekmCertificateRoutes),
            },
            //=========================================================================
            // EKV - tables
            //=========================================================================
            {
                path: 'ekv-table-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/ekv/ekv.routes').then(m => m.ekvRoutes),
            },
            //=========================================================================
            // EAP - applications
            //=========================================================================
            {
                path: 'eap-application-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eap/eap.routes').then(m => m.eapRoutes),
            },
            //=========================================================================
            // ESS - secrets
            //=========================================================================
            {
                path: 'ess-secret-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/ess/ess.routes').then(m => m.essRoutes),
            },
            //=========================================================================
            // EAG - API gateway
            //=========================================================================
            {
                path: 'eag-route-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eag/eag.routes').then(m => m.eagRouteRoutes),
            },
            {
                path: 'eag-listener-list',
                canActivate: [authGuard],
                loadChildren: () => import('./modules/eag/eag.routes').then(m => m.eagListenerRoutes),
            },
            //=========================================================================
            // Monitoring - one page, nine modules, because get-metrics is one action
            //=========================================================================
            {
                path: 'metrics/:target',
                canActivate: [authGuard],
                title: 'Monitoring',
                loadComponent: () => import('./shared/metrics/module-metrics.component').then(m => m.ModuleMetricsComponent),
            },
            //=========================================================================
            // Not found
            //=========================================================================
            {
                path: '**',
                component: NotFoundComponent,
            },
        ],
    },
];

@NgModule({
    imports: [
        BrowserModule,
        RouterModule.forRoot(routes, {
            enableTracing: false,
            useHash: false,
            onSameUrlNavigation: 'reload',
        }),
    ],
    exports: [RouterModule],
    declarations: [],
})
export class AppRoutingModule {
}

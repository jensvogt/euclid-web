import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi} from '@angular/common/http';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {RouterModule, RouterOutlet} from '@angular/router';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatIconModule} from '@angular/material/icon';
import {MatIconButton} from '@angular/material/button';
import {MatDivider} from '@angular/material/divider';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {provideEffects} from '@ngrx/effects';
import {provideStore} from '@ngrx/store';
import {provideRouterStore} from '@ngrx/router-store';

import {AppComponent} from './app.component';
import {AppRoutingModule} from './app.routes';
import {DashboardModule} from './modules/dashboard/dashboard.module';
import {reducers} from './state/root.reducer';
import {LoadingIndicatorComponent} from './shared/spinner/loading-spinner.component';
import {LoadingInterceptor} from './shared/spinner/loading-interceptor.component';

@NgModule({
    declarations: [AppComponent],
    /*
     * The store and effects roots come from the standalone providers, not from StoreModule.forRoot and
     * EffectsModule.forRoot.
     *
     * That is not a style preference. Every module here provides its own slice at its route with
     * `provideState`, and those resolve against the root that `provideStore` installs; with only the
     * NgModule form in place they fail at runtime with NG0201, because the two set up different root
     * tokens. The router is the other way round - `RouterModule.forRoot` inside AppRoutingModule is the
     * one registration, and adding `provideRouter` beside it would make a second router listen to the
     * same history.
     */
    providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideStore(reducers, {}),
        // No root effects of its own - every effect belongs to a module and arrives with its route - but the
        // root has to exist for those to register against.
        provideEffects(),
        provideRouterStore(),
        {provide: HTTP_INTERCEPTORS, useClass: LoadingInterceptor, multi: true},
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        RouterModule,
        RouterOutlet,
        AppRoutingModule,
        DashboardModule,
        MatToolbarModule,
        MatIconModule,
        MatIconButton,
        MatDivider,
        MatFormField,
        MatLabel,
        MatInput,
        MatMenu,
        MatMenuItem,
        MatMenuTrigger,
        FormsModule,
        ReactiveFormsModule,
        LoadingIndicatorComponent,
    ],
    bootstrap: [AppComponent],
})
export class AppModule {
}

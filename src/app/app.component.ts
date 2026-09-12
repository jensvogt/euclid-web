import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {MatDialog, MatDialogConfig} from '@angular/material/dialog';

import {AboutDialog} from './modules/dashboard/settings/config.component';
import {BackendDialog} from './modules/dashboard/backend/backend.component';
import {NamespaceDialog} from './modules/dashboard/namespace/namespace.component';
import {EuclidSessionService} from './services/euclid-session.service';
import {MIN_AUTO_RELOAD_MS} from './shared/autoreload/auto-reload.component';

/** Where the module box in the toolbar sends a name that is not a route on its own. */
const MODULE_LANDING: Record<string, string> = {
    eam: '/eam-user-list',
    esm: '/esm-bucket-list',
    eqs: '/eqs-queue-list',
    ens: '/ens-topic-list',
    ekm: '/ekm-key-list',
    ekv: '/ekv-table-list',
    eap: '/eap-application-list',
    ess: '/ess-secret-list',
    eag: '/eag-route-list',
};

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    standalone: false,
})
export class AppComponent {

    module = '';
    title = 'euclid.web';

    constructor(
        private readonly router: Router,
        private readonly dialog: MatDialog,
        readonly session: EuclidSessionService,
    ) {
        if (!localStorage.getItem('namespace')) {
            localStorage.setItem('namespace', '');
        }
        const autoReload = parseInt(localStorage.getItem('autoReload') ?? '', 10);
        if (!Number.isFinite(autoReload) || autoReload < MIN_AUTO_RELOAD_MS) {
            localStorage.setItem('autoReload', '60000');
        }
    }

    /** Who the figures on screen belong to, which is the account and namespace as much as the user. */
    get scope(): string {
        const session = this.session.session;
        if (session === null) {
            return '';
        }
        return session.userId + ' @ ' + session.accountId + (session.namespace ? ' / ' + session.namespace : '');
    }

    /** Jumps to a module by name, the way awsmock-ui's toolbar jumps to a service. */
    navigateMenu() {
        const name = this.module.trim().toLowerCase();
        this.router.navigate([MODULE_LANDING[name] ?? '/' + name]);
        this.module = '';
    }

    home() {
        this.router.navigate(['/']);
    }

    logout() {
        this.session.logout();
        this.router.navigate(['/login']);
    }

    /** The namespace every namespace-scoped call is restricted to. A round trip - the server validates it. */
    namespace() {
        this.dialog.open(NamespaceDialog, this.dialogConfig('30%'));
    }

    backend() {
        this.dialog.open(BackendDialog, this.dialogConfig('30%'));
    }

    config() {
        this.dialog.open(AboutDialog, this.dialogConfig('30%'));
    }

    private dialogConfig(width: string): MatDialogConfig {
        const config = new MatDialogConfig();
        config.disableClose = true;
        config.autoFocus = true;
        config.width = width;
        config.minWidth = '320px';
        config.maxWidth = '60vw';
        config.maxHeight = '100vh';
        config.panelClass = 'full-screen-modal';
        return config;
    }
}

import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';
import type {Account, Grant, Namespace} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EuclidSessionService} from '../../../services/euclid-session.service';
import {EamGrantsComponent} from '../grants/eam-grants.component';
import {EamService} from '../service/eam.service';
import {eamAccountDetailsActions, eamAccountDetailsSelectors} from './state/eam-account-details.state';

/**
 * One account: what is under it, and what is granted in it.
 *
 * An account is the tenant everything else is scoped by, so the two tabs are the two halves of that
 * scoping - the namespaces it divides into, and every grant made within it. The grants are read-only
 * here apart from revoking: granting needs a principal to grant to, which is a decision made on the page
 * of the user or group that would hold it.
 */
@Component({
    selector: 'eam-account-details',
    templateUrl: './eam-account-details.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardContent,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatMenuModule,
        MatDivider,
        MatTableModule,
        MatTabsModule,
        EamGrantsComponent,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EamAccountDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    account$!: Observable<Account | null>;
    namespaces$!: Observable<Namespace[]>;
    grants$!: Observable<Grant[]>;
    error$!: Observable<string | null>;

    readonly namespaceColumns = ['name', 'description', 'ern', 'created', 'actions'];

    /** The account this page is about, by ID - which is what every EAM action takes. */
    accountId = '';

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly session = inject(EuclidSessionService);
    private readonly eamService = inject(EamService);

    private updateSubscription: Subscription | undefined;

    /** Whether this is the account the session is in, which is worth saying on the page for it. */
    get current(): boolean {
        return this.session.session?.accountId === this.accountId;
    }

    /** Which namespace the session is scoped to, so the row for it can say so. */
    get activeNamespace(): string {
        return this.session.namespace;
    }

    ngOnInit(): void {
        this.accountId = this.route.snapshot.paramMap.get('accountId') ?? '';
        this.account$ = this.store.select(eamAccountDetailsSelectors.selectAccount);
        this.namespaces$ = this.store.select(eamAccountDetailsSelectors.selectNamespaces);
        this.grants$ = this.store.select(eamAccountDetailsSelectors.selectGrants);
        this.error$ = this.store.select(eamAccountDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.accountId) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(eamAccountDetailsActions.load({accountId: this.accountId}));
    }

    // -- the account ---------------------------------------------------------------------------------

    /**
     * Deletes the account and leaves for the list.
     *
     * The server refuses one that still has namespaces or grants, which is what makes this safe to try:
     * the two tabs are where to look when it does.
     */
    deleteAccount(account: Account): void {
        this.confirmThen(
            {
                title: 'Delete account',
                message: `Delete ${account.accountId}? The server refuses while any namespace or grant remains.`,
            },
            this.eamService.deleteAccount(account.accountId),
            'Account deleted',
            () => void this.router.navigate(['/eam-account-list']),
        );
    }

    // -- namespaces ----------------------------------------------------------------------------------

    createNamespace(account: Account): void {
        this.addThen(
            'Create a namespace in ' + account.accountId,
            [
                {name: 'name', label: 'Name', required: true},
                {name: 'description', label: 'Description'},
            ],
            values => this.eamService.createNamespace(
                account.accountId,
                String(values['name']),
                String(values['description']),
            ),
            'Namespace created',
            'Create',
        );
    }

    deleteNamespace(account: Account, namespace: Namespace): void {
        this.confirmThen(
            {
                title: 'Delete namespace',
                message: `Delete ${namespace.name} from ${account.accountId}? The server refuses while any grant in it remains.`,
            },
            this.eamService.deleteNamespace(account.accountId, namespace.name),
            'Namespace deleted',
        );
    }
}

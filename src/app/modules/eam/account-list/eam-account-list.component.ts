import {Component} from '@angular/core';
import type {Account} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EamService} from '../service/eam.service';
import {eamAccountListFeature} from './state/eam-account-list.state';

/**
 * The accounts.
 *
 * Creating and deleting one is administrator-only: an account is platform-level and is not delegated to
 * account owners. Everything else euclid stores belongs to one of these.
 */
@Component({
    selector: 'eam-account-list',
    templateUrl: './eam-account-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EamAccountListComponent extends EuclidListComponent<Account> {

    override readonly feature: ListFeature<Account> = eamAccountListFeature;
    override readonly columns = ['accountId', 'name', 'description', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eamService: EamService) {
        super();
    }

    createAccount(): void {
        this.addThen(
            'Create account',
            [
                {name: 'accountId', label: 'Account ID', required: true},
                {name: 'name', label: 'Name', required: true},
                {name: 'description', label: 'Description'},
            ],
            values => this.eamService.createAccount(
                String(values['accountId']),
                String(values['name']),
                String(values['description']),
            ),
            'Account created',
        );
    }

    /** The server refuses this while anything is left under the account, which the message says up front. */
    deleteAccount(account: Account): void {
        this.confirmThen(
            {
                title: 'Delete account',
                message: `Delete account ${account.accountId} (${account.name})? The server refuses this while it still has namespaces or grants.`,
            },
            this.eamService.deleteAccount(account.accountId),
            'Account deleted',
        );
    }
}

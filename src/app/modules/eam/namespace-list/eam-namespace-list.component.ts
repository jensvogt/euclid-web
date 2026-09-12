import {Component, inject} from '@angular/core';
import type {Namespace} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EuclidSessionService} from '../../../services/euclid-session.service';
import {EamService} from '../service/eam.service';
import {eamNamespaceListFeature} from './state/eam-namespace-list.state';

/**
 * The namespaces of the session's account.
 *
 * A namespace is what a bare name is unique within: two queues called `orders` in two namespaces are two
 * queues. Switching between them is in the toolbar, because it changes what every other page is showing.
 */
@Component({
    selector: 'eam-namespace-list',
    templateUrl: './eam-namespace-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EamNamespaceListComponent extends EuclidListComponent<Namespace> {

    override readonly feature: ListFeature<Namespace> = eamNamespaceListFeature;
    override readonly columns = ['name', 'accountId', 'description', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    private readonly session = inject(EuclidSessionService);

    constructor(private readonly eamService: EamService) {
        super();
    }

    /** Which namespace the session is currently scoped to, so the row for it can say so. */
    get active(): string {
        return this.session.namespace;
    }

    createNamespace(): void {
        this.addThen(
            'Create namespace',
            [
                {name: 'accountId', label: 'Account', required: true, value: this.session.session?.accountId ?? ''},
                {name: 'name', label: 'Name', required: true},
                {name: 'description', label: 'Description'},
            ],
            values => this.eamService.createNamespace(
                String(values['accountId']),
                String(values['name']),
                String(values['description']),
            ),
            'Namespace created',
        );
    }

    /** Switches the session's scope. A round trip: the server checks the namespace against the caller's grants. */
    switchTo(namespace: Namespace): void {
        this.eamService.changeNamespace(namespace.name).subscribe({
            next: () => {
                this.snackBar.open('Namespace is now ' + namespace.name, 'Done', {duration: 5000});
                // Everything else on screen was read under the old scope.
                window.location.reload();
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    deleteNamespace(namespace: Namespace): void {
        this.confirmThen(
            {
                title: 'Delete namespace',
                message: `Delete ${namespace.name}? The server refuses this while any grant on it remains.`,
            },
            this.eamService.deleteNamespace(namespace.accountId, namespace.name),
            'Namespace deleted',
        );
    }
}

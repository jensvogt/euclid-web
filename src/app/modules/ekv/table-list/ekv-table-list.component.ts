import {Component} from '@angular/core';
import type {TableDescription} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EkvService, KEY_STRING, KEY_TYPES} from '../service/ekv.service';
import {ekvTableListFeature} from './state/ekv-table-list.state';

/** The tables in the current namespace, and the keys each is addressed by. */
@Component({
    selector: 'ekv-table-list',
    templateUrl: './ekv-table-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EkvTableListComponent extends EuclidListComponent<TableDescription> {

    override readonly feature: ListFeature<TableDescription> = ekvTableListFeature;
    override readonly columns = ['name', 'partitionKey', 'sortKey', 'itemCount', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly ekvService: EkvService) {
        super();
    }

    /** The partition key cannot be changed later, which is why the dialog says so rather than just asking. */
    createTable(): void {
        this.addThen(
            'Create table',
            [
                {name: 'name', label: 'Name', required: true},
                {
                    name: 'partitionKey',
                    label: 'Partition key',
                    required: true,
                    hint: 'Fixed once the table exists.',
                },
                {name: 'partitionKeyType', label: 'Partition key type', type: 'select', options: KEY_TYPES, value: KEY_STRING},
                {name: 'sortKey', label: 'Sort key', hint: 'Optional.'},
                {name: 'sortKeyType', label: 'Sort key type', type: 'select', options: KEY_TYPES, value: KEY_STRING},
            ],
            values => this.ekvService.createTable(
                String(values['name']),
                String(values['partitionKey']),
                String(values['partitionKeyType']),
                String(values['sortKey']),
                String(values['sortKeyType']),
            ),
            'Table created',
        );
    }

    /** Re-counts one table's items, which the server counts rather than looks up. */
    refreshCount(table: TableDescription): void {
        this.run(this.ekvService.getTable(table.name), 'Item count refreshed');
    }

    deleteTable(table: TableDescription): void {
        this.confirmThen(
            {
                title: 'Delete table',
                message: `Delete ${table.name} and all ${table.itemCount} items in it? This cannot be undone.`,
            },
            this.ekvService.deleteTable(table.name),
            'Table deleted',
        );
    }
}

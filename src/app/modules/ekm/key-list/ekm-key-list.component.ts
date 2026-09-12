import {Component} from '@angular/core';
import type {Key} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {AES, DEFAULT_KEY_LENGTH, DEFAULT_PENDING_WINDOW_DAYS, EkmService} from '../service/ekm.service';
import {ekmKeyListFeature} from './state/ekm-key-list.state';

/** The encryption keys in the current namespace. Never their material - that does not leave the server. */
@Component({
    selector: 'ekm-key-list',
    templateUrl: './ekm-key-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EkmKeyListComponent extends EuclidListComponent<Key> {

    override readonly feature: ListFeature<Key> = ekmKeyListFeature;
    override readonly columns = ['name', 'description', 'algorithm', 'length', 'status', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly ekmService: EkmService) {
        super();
    }

    /** The description is the field worth filling in, so it is the one the dialog insists on. */
    createKey(): void {
        this.addThen(
            'Create key',
            [
                {
                    name: 'description',
                    label: 'Description',
                    required: true,
                    hint: 'A key is named by a generated ID. Months from now this is the only thing that says whether it can be deleted.',
                },
                {name: 'algorithm', label: 'Algorithm', value: AES},
                {name: 'length', label: 'Length (bits)', type: 'number', value: DEFAULT_KEY_LENGTH},
            ],
            values => this.ekmService.createKey(
                String(values['description']),
                String(values['algorithm']),
                Number(values['length']),
            ),
            'Key created',
        );
    }

    setDescription(key: Key): void {
        this.addThen(
            'Description of ' + key.name,
            [{name: 'description', label: 'Description', required: true, value: key.description}],
            values => this.ekmService.setKeyDescription(key.ern, String(values['description'])),
            'Description changed',
            );
    }

    /** Revoking takes a key out of use without destroying it, so what it encrypted stays readable. */
    revokeKey(key: Key): void {
        this.confirmThen(
            {
                title: 'Revoke key',
                message: `Stop ${key.name} being used for new work? Anything already encrypted with it stays readable.`,
                confirm: 'Revoke',
            },
            this.ekmService.revokeKey(key.ern),
            'Key revoked',
        );
    }

    /** Deleting is the one that destroys data, so the window it leaves is the part the confirmation leads with. */
    deleteKey(key: Key): void {
        this.confirmThen(
            {
                title: 'Schedule key deletion',
                message: `Schedule ${key.name} for deletion in ${DEFAULT_PENDING_WINDOW_DAYS} days. When the window closes, everything encrypted with it becomes unreadable for good.`,
                confirm: 'Schedule deletion',
            },
            this.ekmService.deleteKey(key.name),
            'Key scheduled for deletion',
        );
    }
}

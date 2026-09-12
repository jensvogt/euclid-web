import {Component} from '@angular/core';
import type {Secret, SecretValue} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EssService} from '../service/ess.service';
import {essSecretListFeature} from './state/ess-secret-list.state';

/**
 * The secrets in the current namespace, as metadata.
 *
 * A value is fetched only when somebody asks for that one secret, and it is held in a plain field here rather
 * than in the store: the store is long-lived, inspectable in the devtools, and replayed by them, and a secret
 * has no business being in any of that. {@link hide} is how it leaves again.
 */
@Component({
    selector: 'ess-secret-list',
    templateUrl: './ess-secret-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EssSecretListComponent extends EuclidListComponent<Secret> {

    override readonly feature: ListFeature<Secret> = essSecretListFeature;
    override readonly columns = ['name', 'description', 'version', 'rotated', 'created', 'actions'];

    /** The one secret currently revealed, and its value. Never more than one, and never in the store. */
    revealed: {name: string; value: string} | null = null;

    protected readonly dateConversion = dateConversion;

    constructor(private readonly essService: EssService) {
        super();
    }

    override ngOnDestroy(): void {
        this.hide();
        super.ngOnDestroy();
    }

    createSecret(): void {
        this.addThen(
            'Create secret',
            [
                {name: 'name', label: 'Name', required: true},
                {name: 'value', label: 'Value', type: 'password', required: true},
                {name: 'description', label: 'Description'},
                {
                    name: 'keyErn',
                    label: 'Encryption key ERN',
                    hint: 'Leave empty for the namespace default.',
                },
            ],
            values => this.essService.createSecret(
                String(values['name']),
                String(values['value']),
                String(values['description']),
                String(values['keyErn']),
            ),
            'Secret created',
        );
    }

    /** Fetches one value. The only call in the app that brings a secret into the browser. */
    reveal(secret: Secret): void {
        this.essService.getSecret(secret.name).subscribe({
            next: (result: SecretValue) => {
                this.revealed = {name: secret.name, value: result.value};
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    hide(): void {
        this.revealed = null;
    }

    rotate(secret: Secret): void {
        this.addThen(
            'Rotate ' + secret.name,
            [{name: 'value', label: 'New value', type: 'password', required: true}],
            values => this.essService.rotateSecret(secret.name, String(values['value'])),
            'Secret rotated',
        );
    }

    setDescription(secret: Secret): void {
        this.addThen(
            'Description of ' + secret.name,
            [{name: 'description', label: 'Description', required: true, value: secret.description}],
            values => this.essService.updateSecret(secret.name, {description: String(values['description'])}),
            'Description changed',
        );
    }

    deleteSecret(secret: Secret): void {
        this.confirmThen(
            {
                title: 'Delete secret',
                message: `Delete ${secret.name}? The value is gone for good; the key it was under is left alone.`,
            },
            this.essService.deleteSecret(secret.name),
            'Secret deleted',
        );
    }
}

import {Component} from '@angular/core';
import type {AccessKey} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EamService} from '../service/eam.service';
import {eamAccessKeyListFeature} from './state/eam-access-key-list.state';

/**
 * This user's own access keys.
 *
 * The keys are for programs - euclid-cli, euclid-ndk, euclid-jdk - rather than for this UI: signing a request
 * covers the `host` header, which a browser will not let script set, so a created secret is shown here to be
 * copied somewhere else rather than used.
 *
 * The secret is visible exactly once, because `create-access-key` is the only call that ever returns it. It is
 * held in a plain field and dropped when the page is left - never in the store, which the devtools can inspect
 * and replay.
 */
@Component({
    selector: 'eam-access-key-list',
    templateUrl: './eam-access-key-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EamAccessKeyListComponent extends EuclidListComponent<AccessKey> {

    override readonly feature: ListFeature<AccessKey> = eamAccessKeyListFeature;
    override readonly columns = ['accessKeyId', 'active', 'createdAt', 'actions'];

    /** The secret of the key just created. Shown once; `dismiss` is how it goes away. */
    created: {accessKeyId: string; secretAccessKey: string} | null = null;

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eamService: EamService) {
        super();
    }

    override ngOnDestroy(): void {
        this.dismiss();
        super.ngOnDestroy();
    }

    createAccessKey(): void {
        this.eamService.createAccessKey().subscribe({
            next: result => {
                this.created = {
                    accessKeyId: result.accessKeyId ?? '',
                    secretAccessKey: result.secretAccessKey ?? '',
                };
                this.load();
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    dismiss(): void {
        this.created = null;
    }

    deleteAccessKey(key: AccessKey): void {
        this.confirmThen(
            {
                title: 'Delete access key',
                message: `Delete ${key.accessKeyId}? Anything still signing with it starts failing immediately.`,
            },
            this.eamService.deleteAccessKey(key.accessKeyId),
            'Access key deleted',
        );
    }
}

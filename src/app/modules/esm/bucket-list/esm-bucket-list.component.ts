import {Component} from '@angular/core';
import type {Bucket} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EsmService} from '../service/esm.service';
import {esmBucketListFeature} from './state/esm-bucket-list.state';

/** The buckets in the current namespace: what they hold, and whether they are encrypted. */
@Component({
    selector: 'esm-bucket-list',
    templateUrl: './esm-bucket-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EsmBucketListComponent extends EuclidListComponent<Bucket> {

    override readonly feature: ListFeature<Bucket> = esmBucketListFeature;
    override readonly columns = ['name', 'objects', 'size', 'encrypted', 'created', 'modified', 'actions'];

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    constructor(private readonly esmService: EsmService) {
        super();
    }

    createBucket(): void {
        this.addThen(
            'Create bucket',
            [{name: 'name', label: 'Name', required: true}],
            values => this.esmService.createBucket(String(values['name'])),
            'Bucket created',
        );
    }

    renameBucket(bucket: Bucket): void {
        this.addThen(
            'Rename ' + bucket.name,
            [{name: 'newName', label: 'New name', required: true, value: bucket.name}],
            values => this.esmService.renameBucket(bucket.ern, String(values['newName'])),
            'Bucket renamed',
        );
    }

    /**
     * Encrypts a bucket.
     *
     * An empty key ID is the usual answer: ESM mints a key for the bucket, and the point is that the objects
     * are encrypted rather than which key it was.
     */
    enableEncryption(bucket: Bucket): void {
        this.addThen(
            'Encrypt ' + bucket.name,
            [{
                name: 'keyId',
                label: 'Key ID',
                hint: 'Leave empty and ESM creates a key for this bucket.',
            }],
            values => this.esmService.enableEncryption(bucket.ern, String(values['keyId'])),
            'Encryption enabled',
        );
    }

    disableEncryption(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Disable encryption',
                message: `Stop encrypting new objects in ${bucket.name}? Objects already encrypted stay encrypted and readable.`,
                confirm: 'Disable',
            },
            this.esmService.disableEncryption(bucket.ern),
            'Encryption disabled',
        );
    }

    purgeBucket(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Purge bucket',
                message: `Delete all ${bucket.objects} objects in ${bucket.name} and keep the bucket? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(bucket.ern),
            'Bucket purged',
        );
    }

    /** Deleting needs an empty bucket, so the message says which of the two the user probably wants. */
    deleteBucket(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Delete bucket',
                message: bucket.objects > 0
                    ? `${bucket.name} still holds ${bucket.objects} objects, and the server will refuse to delete it. Purge it first.`
                    : `Delete ${bucket.name}? This cannot be undone.`,
            },
            this.esmService.deleteBucket(bucket.ern),
            'Bucket deleted',
        );
    }
}

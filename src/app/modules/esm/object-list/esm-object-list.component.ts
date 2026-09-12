import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import type {EsmObject} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EsmService} from '../service/esm.service';
import {esmObjectListFeature} from './state/esm-object-list.state';

/**
 * One bucket's objects.
 *
 * The prefix box narrows by key, which is the only structure a bucket has: keys are opaque strings, and a
 * "directory" is nothing more than a set of them that share a leading segment.
 */
@Component({
    selector: 'esm-object-list',
    templateUrl: './esm-object-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EsmObjectListComponent extends EuclidListComponent<EsmObject> {

    override readonly feature: ListFeature<EsmObject> = esmObjectListFeature;
    override readonly columns = ['key', 'size', 'contentType', 'encrypted', 'created', 'modified', 'actions'];

    bucketErn = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    constructor(private readonly esmService: EsmService) {
        super();
    }

    override ngOnInit(): void {
        this.bucketErn = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.parent = this.bucketErn;
        super.ngOnInit();
    }

    get bucketName(): string {
        return this.bucketErn.substring(this.bucketErn.lastIndexOf(':') + 1);
    }

    deleteObject(object: EsmObject): void {
        this.confirmThen(
            {title: 'Delete object', message: `Delete ${object.key}? This cannot be undone.`},
            this.esmService.deleteObject(object.ern),
            'Object deleted',
        );
    }

    /** Deletes every object under whatever the prefix box currently holds, which may be everything. */
    purge(): void {
        const prefix = this.prefixValue;
        this.confirmThen(
            {
                title: 'Purge bucket',
                message: prefix
                    ? `Delete every object in ${this.bucketName} whose key starts with "${prefix}"? This cannot be undone.`
                    : `Delete every object in ${this.bucketName}? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(this.bucketErn, prefix),
            'Objects deleted',
        );
    }
}

import {inject} from '@angular/core';
import type {Bucket} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EsmService} from '../../service/esm.service';

export const esmBucketListFeature = createListFeature<Bucket>('esm-bucket-list', {column: 'objects', direction: 'desc'});

/**
 * Loading the bucket list.
 *
 * Ordered by how many objects a bucket holds rather than by name, as the queue list is ordered by how many
 * messages are waiting: the bucket somebody opening this page is looking for is the one with something in
 * it, and an installation's empty buckets are the ones alphabetical order puts first as readily as any.
 */
export const loadBuckets$ = createListEffect(esmBucketListFeature, () => {
    const service = inject(EsmService);
    return query => service.listBuckets(query);
});

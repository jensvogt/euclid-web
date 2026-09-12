import {inject} from '@angular/core';
import type {Bucket} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EsmService} from '../../service/esm.service';

export const esmBucketListFeature = createListFeature<Bucket>('esm-bucket-list', {column: 'name', direction: 'asc'});

export const loadBuckets$ = createListEffect(esmBucketListFeature, () => {
    const service = inject(EsmService);
    return query => service.listBuckets(query);
});

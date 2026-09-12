import {inject} from '@angular/core';
import type {EsmObject} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EsmService} from '../../service/esm.service';

export const esmObjectListFeature = createListFeature<EsmObject>('esm-object-list', {column: 'key', direction: 'asc'});

/** `query.parent` is the bucket's ERN, and `query.prefix` narrows by key rather than by name. */
export const loadObjects$ = createListEffect(esmObjectListFeature, () => {
    const service = inject(EsmService);
    return query => service.listObjects(query.parent, query);
});

import {inject} from '@angular/core';
import type {TableDescription} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EkvService} from '../../service/ekv.service';

export const ekvTableListFeature = createListFeature<TableDescription>('ekv-table-list', {column: 'name', direction: 'asc'});

export const loadTables$ = createListEffect(ekvTableListFeature, () => {
    const service = inject(EkvService);
    return query => service.listTables(query);
});

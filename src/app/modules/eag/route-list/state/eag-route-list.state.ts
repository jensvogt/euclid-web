import {inject} from '@angular/core';
import type {Route} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EagService} from '../../service/eag.service';

export const eagRouteListFeature = createListFeature<Route>('eag-route-list', {column: 'path', direction: 'asc'});

/** By path, because a gateway's routes are read as a map of what it serves. Paging is local - see the service. */
export const loadRoutes$ = createListEffect(eagRouteListFeature, () => {
    const service = inject(EagService);
    return query => service.listRoutes(query.prefix, query.pageSize, query.pageIndex, query.sortColumn, query.sortDirection);
});

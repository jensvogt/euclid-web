import {inject} from '@angular/core';
import type {TransferServer} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EtsService} from '../../service/ets.service';

export const etsServerListFeature = createListFeature<TransferServer>('ets-server-list', {column: 'serverId', direction: 'asc'});

/**
 * Loading the transfer server list.
 *
 * ETS answers with every match at once, so the paging and the sorting happen in the service rather than
 * at the server - see {@link EtsService.listServers}. The effect looks the same either way.
 */
export const loadServers$ = createListEffect(etsServerListFeature, () => {
    const service = inject(EtsService);
    return query => service.listServers(query.prefix, query.pageSize, query.pageIndex, query.sortColumn, query.sortDirection);
});

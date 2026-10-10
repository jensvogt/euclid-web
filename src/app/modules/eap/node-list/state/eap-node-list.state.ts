import {inject} from '@angular/core';
import type {WorkerNode} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EapService} from '../../service/eap.service';

export const eapNodeListFeature = createListFeature<WorkerNode>('eap-node-list', {column: 'name', direction: 'asc'});

/**
 * Loading the worker node list.
 *
 * Ordered by name rather than by anything about the host's state: a fleet is read by looking for one
 * machine, and the name is what somebody has in mind when they do. What is wrong with a node shows in
 * its row.
 *
 * EAP answers with every node at once, so the paging, the sorting and the prefix are the service's -
 * see {@link EapService.listNodes}. The effect looks the same either way.
 */
export const loadNodes$ = createListEffect(eapNodeListFeature, () => {
    const service = inject(EapService);
    return query => service.listNodes(query.prefix, query.pageSize, query.pageIndex, query.sortColumn, query.sortDirection);
});

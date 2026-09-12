import {inject} from '@angular/core';
import type {Queue} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EqsService} from '../../service/eqs.service';

export const eqsQueueListFeature = createListFeature<Queue>('eqs-queue-list', {column: 'available', direction: 'desc'});

/**
 * Loading the queue list.
 *
 * Ordered by how many messages are waiting rather than by name, because that is what somebody opening this
 * page is looking for - the queue that is backing up, not the one that is alphabetically first.
 */
export const loadQueues$ = createListEffect(eqsQueueListFeature, () => {
    const service = inject(EqsService);
    return query => service.listQueues(query);
});

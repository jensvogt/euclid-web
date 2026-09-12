import {inject} from '@angular/core';
import type {QueueMessage} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EqsService} from '../../service/eqs.service';

export const eqsMessageListFeature = createListFeature<QueueMessage>('eqs-message-list', {column: 'created', direction: 'desc'});

/**
 * Loading one queue's messages.
 *
 * `query.parent` is the queue's ERN, which came from the route - see {@link ListQueryProps.parent}. Newest
 * first, because a queue is read from the end somebody is currently worried about.
 */
export const loadMessages$ = createListEffect(eqsMessageListFeature, () => {
    const service = inject(EqsService);
    return query => service.listMessages(query.parent, query);
});

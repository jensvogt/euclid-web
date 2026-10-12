import {inject} from '@angular/core';
import type {TopicMessage} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EnsService} from '../../service/ens.service';

/**
 * Newest first, which for a topic is publish order.
 *
 * `created` is the column's name and not the field the server sorts by - see
 * EnsMessageListComponent.sortFields, which is where the reason this matters is written down.
 */
export const ensMessageListFeature = createListFeature<TopicMessage>('ens-message-list', {column: 'created', direction: 'desc'});

/** `query.parent` is the topic's ERN. These are the messages the topic kept, per its retention period. */
export const loadMessages$ = createListEffect(ensMessageListFeature, () => {
    const service = inject(EnsService);
    return query => service.listMessages(query.parent, query);
});

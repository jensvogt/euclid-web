import {inject} from '@angular/core';
import type {Topic} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EnsService} from '../../service/ens.service';

/**
 * Busiest first, which is what somebody opening the topic list came to see.
 *
 * `messages` is the column's name rather than the field's - the count is stored as `available` and
 * renamed on the way out - so the list view maps it. See EnsTopicListComponent.sortFields.
 */
export const ensTopicListFeature = createListFeature<Topic>('ens-topic-list', {column: 'messages', direction: 'desc'});

export const loadTopics$ = createListEffect(ensTopicListFeature, () => {
    const service = inject(EnsService);
    return query => service.listTopics(query);
});

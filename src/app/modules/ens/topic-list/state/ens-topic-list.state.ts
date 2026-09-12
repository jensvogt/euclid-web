import {inject} from '@angular/core';
import type {Topic} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EnsService} from '../../service/ens.service';

export const ensTopicListFeature = createListFeature<Topic>('ens-topic-list', {column: 'name', direction: 'asc'});

export const loadTopics$ = createListEffect(ensTopicListFeature, () => {
    const service = inject(EnsService);
    return query => service.listTopics(query);
});

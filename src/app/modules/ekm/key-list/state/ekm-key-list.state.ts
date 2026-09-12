import {inject} from '@angular/core';
import type {Key} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EkmService} from '../../service/ekm.service';

export const ekmKeyListFeature = createListFeature<Key>('ekm-key-list', {column: 'created', direction: 'desc'});

/** Newest first: a key is named by a generated ID, so "the one I just made" is the findable one. */
export const loadKeys$ = createListEffect(ekmKeyListFeature, () => {
    const service = inject(EkmService);
    return query => service.listKeys(query);
});

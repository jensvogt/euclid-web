import {inject} from '@angular/core';
import type {Secret} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EssService} from '../../service/ess.service';

export const essSecretListFeature = createListFeature<Secret>('ess-secret-list', {column: 'name', direction: 'asc'});

/** Metadata only. No secret value passes through the store - see the list component's `reveal`. */
export const loadSecrets$ = createListEffect(essSecretListFeature, () => {
    const service = inject(EssService);
    return query => service.listSecrets(query);
});

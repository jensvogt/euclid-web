import {inject} from '@angular/core';
import type {AccessKey} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EamService} from '../../service/eam.service';

export const eamAccessKeyListFeature = createListFeature<AccessKey>('eam-access-key-list', {column: 'createdAt', direction: 'desc'});

/**
 * This user's own access keys.
 *
 * `list-access-keys` takes no arguments and answers with the lot - there are a handful per user - so the query
 * is built and then ignored, and the service wraps the array as a page.
 */
export const loadAccessKeys$ = createListEffect(eamAccessKeyListFeature, () => {
    const service = inject(EamService);
    return () => service.listAccessKeys();
});

import {inject} from '@angular/core';
import type {Namespace} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EamService} from '../../service/eam.service';

export const eamNamespaceListFeature = createListFeature<Namespace>('eam-namespace-list', {column: 'name', direction: 'asc'});

/** The session's own account, which is what the service fills in when none is named. */
export const loadNamespaces$ = createListEffect(eamNamespaceListFeature, () => {
    const service = inject(EamService);
    return query => service.listNamespaces(query);
});

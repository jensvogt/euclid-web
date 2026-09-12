import {inject} from '@angular/core';
import type {Application} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EapService} from '../../service/eap.service';

export const eapApplicationListFeature = createListFeature<Application>('eap-application-list', {column: 'applicationId', direction: 'asc'});

/**
 * Loading the application list.
 *
 * EAP answers with every match at once, so the paging and sorting happen in the service rather than at the
 * server - see {@link EapService.listApplications}. The effect looks the same either way.
 */
export const loadApplications$ = createListEffect(eapApplicationListFeature, () => {
    const service = inject(EapService);
    return query => service.listApplications(query.prefix, query.pageSize, query.pageIndex, query.sortColumn, query.sortDirection);
});

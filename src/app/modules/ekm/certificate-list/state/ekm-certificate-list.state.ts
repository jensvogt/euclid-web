import {inject} from '@angular/core';
import type {Certificate} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EkmService} from '../../service/ekm.service';

export const ekmCertificateListFeature = createListFeature<Certificate>('ekm-certificate-list', {column: 'notAfter', direction: 'asc'});

/** Soonest to expire first, which is the question somebody opens this page with. */
export const loadCertificates$ = createListEffect(ekmCertificateListFeature, () => {
    const service = inject(EkmService);
    return query => service.listCertificates(query);
});

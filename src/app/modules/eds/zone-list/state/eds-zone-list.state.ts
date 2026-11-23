import {inject} from '@angular/core';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EdsService, HostedZone} from '../../service/eds.service';

/** By name, which is the only order a list of zones has: an apex is what identifies one. */
export const edsZoneListFeature = createListFeature<HostedZone>('eds-zone-list', {column: 'name', direction: 'asc'});

export const loadZones$ = createListEffect(edsZoneListFeature, () => {
    const service = inject(EdsService);
    return query => service.listZones(query);
});

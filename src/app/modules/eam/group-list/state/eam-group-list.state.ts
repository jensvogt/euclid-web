import {inject} from '@angular/core';
import type {UserGroup} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EamService} from '../../service/eam.service';

export const eamGroupListFeature = createListFeature<UserGroup>('eam-group-list', {column: 'name', direction: 'asc'});

export const loadGroups$ = createListEffect(eamGroupListFeature, () => {
    const service = inject(EamService);
    return query => service.listUserGroups(query);
});

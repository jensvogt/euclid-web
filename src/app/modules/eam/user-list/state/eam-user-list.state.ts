import {inject} from '@angular/core';
import type {User} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EamService} from '../../service/eam.service';

export const eamUserListFeature = createListFeature<User>('eam-user-list', {column: 'userId', direction: 'asc'});

export const loadUsers$ = createListEffect(eamUserListFeature, () => {
    const service = inject(EamService);
    return query => service.listUsers(query);
});

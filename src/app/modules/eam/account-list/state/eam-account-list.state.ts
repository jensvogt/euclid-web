import {inject} from '@angular/core';
import type {Account} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EamService} from '../../service/eam.service';

export const eamAccountListFeature = createListFeature<Account>('eam-account-list', {column: 'accountId', direction: 'asc'});

export const loadAccounts$ = createListEffect(eamAccountListFeature, () => {
    const service = inject(EamService);
    return query => service.listAccounts(query);
});

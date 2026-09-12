import {inject} from '@angular/core';
import type {Listener} from 'euclid-ndk';

import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EagService} from '../../service/eag.service';

export const eagListenerListFeature = createListFeature<Listener>('eag-listener-list', {column: 'port', direction: 'asc'});

/**
 * The ports the gateway is listening on.
 *
 * `list-listeners` takes no paging or prefix at all - there are as many listeners as there are configured
 * namespaces - so the query is built and then ignored. Which is why this view hides the prefix box.
 */
export const loadListeners$ = createListEffect(eagListenerListFeature, () => {
    const service = inject(EagService);
    return () => service.listListeners();
});

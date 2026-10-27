import {inject} from '@angular/core';
import {map} from 'rxjs';
import type {EsmObject} from 'euclid-ndk';

import {Page} from '../../../../services/euclid-http.service';
import {createListEffect, createListFeature} from '../../../../shared/list/list-feature';
import {EsmService, ObjectLevel} from '../../service/esm.service';

export const esmObjectListFeature = createListFeature<EsmObject>('esm-object-list', {column: 'key', direction: 'asc'});

/**
 * `query.parent` is the bucket's ERN, and `query.prefix` is either a search or a level.
 *
 * Which of the two is `query.delimiter`: the view sets it while it is showing the tree, and the prefix
 * is then the path being browsed rather than the start of a key somebody typed. The directories that
 * come back with a level are the tree's, which asks for them itself - the page here is only the objects.
 */
export const loadObjects$ = createListEffect(esmObjectListFeature, () => {
    const service = inject(EsmService);
    return query => query.delimiter
        ? service.listLevel(query.parent, query.prefix, query).pipe(map((level: ObjectLevel) => level as Page<EsmObject>))
        : service.listObjects(query.parent, query);
});

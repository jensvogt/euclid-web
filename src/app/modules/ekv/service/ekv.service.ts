import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Item, ScanResult, TableDescription} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ekv';

/** What a key column holds. */
export const KEY_STRING = 'string';
export const KEY_NUMBER = 'number';
export const KEY_BINARY = 'binary';
export const KEY_TYPES = [KEY_STRING, KEY_NUMBER, KEY_BINARY];

/** EKV - euclid's key-value store: tables and the items in them. */
@Injectable({providedIn: 'root'})
export class EkvService {

    constructor(private readonly http: EuclidHttpService) {
    }

    listTables(query: ListQuery): Observable<Page<TableDescription>> {
        return this.http.page<TableDescription>(TARGET, 'list-tables', 'tables', listPayload(query, 'name'));
    }

    createTable(name: string, partitionKey: string, partitionKeyType = KEY_STRING, sortKey = '', sortKeyType = KEY_STRING): Observable<unknown> {
        return this.http.call(TARGET, 'create-table', {
            name: name,
            partitionKey: partitionKey,
            partitionKeyType: partitionKeyType,
            sortKey: sortKey,
            sortKeyType: sortKeyType,
        });
    }

    /**
     * A table's key and how many items it holds.
     *
     * The count is counted rather than looked up, so this is not free on a large table - which is why the
     * list view shows what `list-tables` already answered with rather than asking again per row.
     */
    getTable(name: string): Observable<TableDescription> {
        return this.http.call<TableDescription>(TARGET, 'get-table', {name: name});
    }

    /** Deletes a table and every item in it. There is no confirmation at the server and nothing is kept. */
    deleteTable(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-table', {name: name});
    }

    // -- items ---------------------------------------------------------------------------------

    /**
     * Every item in a table, a page at a time.
     *
     * A scan rather than a query, because a list view has no key to query on: `scan` walks the table and
     * `total` is how many it walked past. Expensive by nature on a large table, as it is in any key-value
     * store.
     */
    scan(table: string, pageSize = 10, pageIndex = 0): Observable<ScanResult> {
        return this.http.call<ScanResult>(TARGET, 'scan', {table: table, pageSize: pageSize, pageIndex: pageIndex});
    }

    getItem(table: string, key: Record<string, unknown>): Observable<Item> {
        return this.http.call<Item>(TARGET, 'get-item', {table: table, key: key});
    }

    deleteItem(table: string, key: Record<string, unknown>): Observable<unknown> {
        return this.http.call(TARGET, 'delete-item', {table: table, key: key});
    }
}

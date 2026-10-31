import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Item, ScanResult, TableDescription} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ekv';

/**
 * Where the server keeps an item's timestamps: as two ordinary attributes of the item itself.
 *
 * Lifted out of the rest by {@link itemOf}, because leaving them in would mean an item read, changed
 * and written back acquires two attributes it never had - and a write replaces rather than merges, so
 * they would stick.
 */
export const CREATED_ATTRIBUTE = '_created';
export const MODIFIED_ATTRIBUTE = '_modified';

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
     * A table's items, a page at a time, without regard to their keys.
     *
     * What a list view can always do: a scan walks the table, and `total` is how many it walked past.
     * Expensive by nature on a large table, as it is in any key-value store - which is what the filters
     * are for. They narrow at the server rather than here, so a filtered scan still walks the table but
     * answers with what matched; `attributeName` may be any attribute, not only a key one.
     */
    scan(options: ScanOptions): Observable<ScanResult> {
        const payload: Record<string, unknown> = {
            table: options.table,
            pageSize: options.pageSize,
            pageIndex: options.pageIndex,
            sortColumn: options.sortColumn ?? '',
            sortDirection: options.sortDirection ?? 'asc',
            modifiedFrom: options.modifiedFrom ?? '',
            modifiedTo: options.modifiedTo ?? '',
            attributeName: options.attributeName ?? '',
            attributeOperator: options.attributeName ? options.attributeOperator ?? '' : '',
        };
        // Sent only when there is one: the server reads these as typed JSON values, and an empty string
        // where a number is expected is a comparison against "" rather than no comparison at all.
        if (options.attributeName && options.attributeValue !== undefined) {
            payload['attributeValue'] = options.attributeValue;
        }
        if (options.attributeName && options.attributeUpper !== undefined) {
            payload['attributeUpper'] = options.attributeUpper;
        }
        return this.http.call<RawScanResult>(TARGET, 'scan', payload).pipe(
            map((result: RawScanResult) => ({
                items: (result.items ?? []).map(itemOf),
                count: result.count ?? 0,
                total: result.total ?? 0,
            })),
        );
    }

    /**
     * One partition's items, in sort-key order.
     *
     * The cheap read, and the one a key-value store is for: a query goes to a partition and walks it,
     * where a scan walks everything. It needs the partition key's value, which is why it is something to
     * ask for rather than a page a list view can show by itself.
     *
     * No `total`: the server answers what it returned and does not count the partition to say what it
     * did not - see {@link QueryResult}. The count is how many came back.
     */
    query(options: QueryOptions): Observable<ScanResult> {
        const payload: Record<string, unknown> = {
            table: options.table,
            partitionKey: options.partitionKey,
            sortOperator: options.sortOperator ?? '',
            forward: options.forward ?? true,
            pageSize: options.pageSize,
            pageIndex: options.pageIndex,
        };
        if (options.sortOperator && options.sortValue !== undefined) {
            payload['sortValue'] = options.sortValue;
        }
        if (options.sortOperator === 'between' && options.sortUpper !== undefined) {
            payload['sortUpper'] = options.sortUpper;
        }
        return this.http.call<RawScanResult>(TARGET, 'query', payload).pipe(
            map((result: RawScanResult) => ({
                items: (result.items ?? []).map(itemOf),
                count: result.count ?? 0,
                total: result.total ?? 0,
            })),
        );
    }

    getItem(table: string, key: Record<string, unknown>): Observable<Item> {
        return this.http.call<Record<string, unknown>>(TARGET, 'get-item', {table: table, key: key}).pipe(
            map(itemOf),
        );
    }

    deleteItem(table: string, key: Record<string, unknown>): Observable<unknown> {
        return this.http.call(TARGET, 'delete-item', {table: table, key: key});
    }
}

/**
 * How a sort key or an attribute may be compared, in the server's own vocabulary.
 *
 * Shared by both reads: a query narrows the sort key with one of these, and a scan narrows any attribute
 * with the same set. `between` is the one that takes an upper bound as well, and `begins-with` the one
 * that only means anything for a string.
 */
export const SORT_OPERATORS = ['eq', 'lt', 'le', 'gt', 'ge', 'between', 'begins-with'] as const;
export type SortOperator = typeof SORT_OPERATORS[number];

/** What a scan may be narrowed by. Everything beyond the page is optional, and empty narrows nothing. */
export interface ScanOptions {
    table: string;
    pageSize: number;
    pageIndex: number;
    /** `pk`, `sk` or `modified`; anything else is the server's own order. */
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
    /** ISO-8601 bounds on when an item was last written. */
    modifiedFrom?: string;
    modifiedTo?: string;
    attributeName?: string;
    attributeOperator?: SortOperator;
    /** Typed as the value is written, so a number compares as a number. */
    attributeValue?: unknown;
    attributeUpper?: unknown;
}

/** What a query takes: a partition, and how much of it in which direction. */
export interface QueryOptions {
    table: string;
    pageSize: number;
    pageIndex: number;
    /** The partition key's value, typed as the table declares it. */
    partitionKey: unknown;
    sortOperator?: SortOperator;
    sortValue?: unknown;
    sortUpper?: unknown;
    /** Ascending sort-key order. */
    forward?: boolean;
}

/**
 * A value typed the way the table declares its key.
 *
 * The dialog answers in strings whatever the field was, and the server compares a key against its own
 * type: a number key given `"17"` is a string where a number was declared, which it refuses rather than
 * guesses at. `binary` stays the base64 it is on the wire.
 */
export function keyValueOf(type: string, text: string): unknown {
    return type === 'number' ? Number(text) || 0 : text;
}

/** A scan as it arrives: items are flat maps of their own attributes, not the shape euclid-ndk parses. */
interface RawScanResult {
    items?: Record<string, unknown>[];
    count?: number;
    total?: number;
}

/**
 * One item, rearranged into the shape the rest of the app expects.
 *
 * An item on the wire *is* its attributes - there is no `attributes` field to read, and the timestamps
 * are two of those attributes. euclid-ndk's `toItem` does this same lifting, which is exactly the trap:
 * the SDK's `Item` type describes the parsed shape and this UI never runs the parser, so typing a raw
 * response as `Item` type-checks and then reads `undefined` for every value.
 */
function itemOf(document: Record<string, unknown>): Item {
    const attributes = {...document};
    delete attributes[CREATED_ATTRIBUTE];
    delete attributes[MODIFIED_ATTRIBUTE];

    return {
        attributes: attributes,
        created: String(document[CREATED_ATTRIBUTE] ?? ''),
        modified: String(document[MODIFIED_ATTRIBUTE] ?? ''),
    };
}

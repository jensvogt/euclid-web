import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatPaginator, PageEvent} from '@angular/material/paginator';
import {MatTableModule} from '@angular/material/table';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {Observable, Subscription} from 'rxjs';
import type {Item, TableDescription} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EkvService, keyValueOf, SORT_OPERATORS, SortOperator} from '../service/ekv.service';
import {ekvTableDetailsActions, ekvTableDetailsSelectors, ItemRequest} from './state/ekv-table-details.state';

/**
 * One table: what it is keyed on, and what is in it.
 *
 * The first place in this UI that shows an item at all - the list has the tables and nothing below them
 * - so the point of the page is the scan underneath the key.
 *
 * **It does not reload itself**, which every other details page does. Both of its calls cost: `get-table`
 * counts the items rather than looking the figure up, and a scan walks the table. A page re-reading both
 * every minute would be a standing load on the server for a tab nobody is looking at. The refresh button
 * and the paginator are what ask; the footer says when the answer came.
 */
@Component({
    selector: 'ekv-table-details',
    templateUrl: './ekv-table-details.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardContent,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatMenuModule,
        MatDivider,
        MatTableModule,
        MatPaginator,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EkvTableDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    table$!: Observable<TableDescription | null>;
    items$!: Observable<Item[]>;
    total$!: Observable<number>;
    error$!: Observable<string | null>;

    /**
     * The item table's columns, which depend on the table's own key.
     *
     * Held rather than computed in the template: `mat-table` takes its column list by reference like it
     * takes its rows, and a getter returning a new array would have it rebuild the header on every change
     * detection pass.
     */
    itemColumns: string[] = ['partition', 'attributes', 'created', 'modified', 'actions'];

    pageIndex = 0;
    pageSize = 10;
    readonly pageSizeOptions = [5, 10, 20, 50, 100];

    /**
     * What the page is showing, which is a plain scan until somebody asks for something else.
     *
     * Kept rather than re-derived, because paging asks the same question again with another page: the
     * filters of a scan and the partition of a query have to survive that.
     */
    request: ItemRequest = {mode: 'scan', table: '', pageSize: 10, pageIndex: 0};

    /** The table this page is about, by name - which is what every EKV action takes. */
    name = '';

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly ekvService = inject(EkvService);

    private readonly watching = new Subscription();

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.table$ = this.store.select(ekvTableDetailsSelectors.selectTable);
        this.items$ = this.store.select(ekvTableDetailsSelectors.selectItems);
        this.total$ = this.store.select(ekvTableDetailsSelectors.selectTotal);
        this.error$ = this.store.select(ekvTableDetailsSelectors.selectError);

        // A table with a sort key has two key columns rather than one, and that is known only once the
        // description has arrived.
        this.watching.add(this.table$.subscribe(table => {
            this.itemColumns = table?.sortKey
                ? ['partition', 'sort', 'attributes', 'created', 'modified', 'actions']
                : ['partition', 'attributes', 'created', 'modified', 'actions'];
        }));

        this.load();
    }

    ngOnDestroy(): void {
        this.watching.unsubscribe();
    }

    /** Reads the table and the page of items it is showing. Both, because refresh means both. */
    override load(): void {
        if (!this.name) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(ekvTableDetailsActions.load({name: this.name}));
        this.scan();
    }

    handlePageEvent(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
        this.scan();
    }

    // -- asking a different question -----------------------------------------------------------------

    /** What the page is showing, as one line above the table. */
    get reading(): string {
        if (this.request.mode === 'query') {
            const sort = this.request.sortOperator
                ? `, sort key ${this.request.sortOperator} ${String(this.request.sortValue)}`
                : '';
            return `Partition ${String(this.request.partitionKey)}${sort}`;
        }
        const narrowed = this.request.attributeName
            ? `${this.request.attributeName} ${this.request.attributeOperator} ${String(this.request.attributeValue)}`
            : '';
        const since = this.request.modifiedFrom || this.request.modifiedTo
            ? `modified ${this.request.modifiedFrom || 'any'} to ${this.request.modifiedTo || 'now'}`
            : '';
        const both = [narrowed, since].filter(part => part !== '').join(', ');
        return both ? `Scan, ${both}` : '';
    }

    /**
     * Reads one partition, in sort-key order.
     *
     * The cheap read, and what a key-value store is for: a query goes to one partition where a scan
     * walks the table. It needs the partition key's value, which is why it is asked for rather than
     * being something the page could show by itself.
     *
     * The sort fields are offered only for a table that has a sort key, since there is otherwise
     * nothing in a partition to narrow by - its items are the one item.
     */
    queryItems(table: TableDescription): void {
        this.askThen(
            `Query ${table.name}`,
            [
                {
                    name: 'partitionKey',
                    label: `${table.partitionKey} (${table.partitionKeyType})`,
                    required: true,
                    hint: 'The partition to read. A query is of one partition - that is what makes it cheap.',
                },
                ...(table.sortKey ? [
                    {
                        name: 'sortOperator',
                        label: `Narrow by ${table.sortKey}`,
                        type: 'select' as const,
                        options: ['', ...SORT_OPERATORS],
                        value: '',
                        hint: 'Empty takes the whole partition. begins-with only applies to a string sort key.',
                    },
                    {name: 'sortValue', label: `${table.sortKey} (${table.sortKeyType})`},
                    {name: 'sortUpper', label: 'Upper bound', hint: 'For between only.'},
                ] : []),
                {name: 'forward', label: 'Ascending sort-key order', type: 'boolean', value: true},
            ],
            'Query',
            values => {
                const operator = String(values['sortOperator'] ?? '') as SortOperator | '';
                this.pageIndex = 0;
                this.request = {
                    mode: 'query',
                    table: table.name,
                    pageSize: this.pageSize,
                    pageIndex: 0,
                    partitionKey: keyValueOf(table.partitionKeyType, String(values['partitionKey']).trim()),
                    sortOperator: operator === '' ? undefined : operator,
                    sortValue: operator === '' ? undefined : keyValueOf(table.sortKeyType, String(values['sortValue'] ?? '')),
                    sortUpper: operator === 'between'
                        ? keyValueOf(table.sortKeyType, String(values['sortUpper'] ?? ''))
                        : undefined,
                    forward: values['forward'] === true,
                };
                this.scan();
            },
        );
    }

    /**
     * Walks the table, narrowed by whatever was given.
     *
     * The filters are the server's: a scan still walks the table whatever is asked, and narrowing here
     * would mean hiding rows from a page that had already paid for them. `attributeName` is any
     * attribute, not only a key one, which is the whole difference from a query.
     */
    scanItems(table: TableDescription): void {
        this.askThen(
            `Scan ${table.name}`,
            [
                {
                    name: 'attributeName',
                    label: 'Attribute',
                    hint: 'Any attribute, not only a key one. Empty narrows nothing.',
                },
                {
                    name: 'attributeOperator',
                    label: 'Compare',
                    type: 'select',
                    options: [...SORT_OPERATORS],
                    value: 'eq',
                },
                {name: 'attributeValue', label: 'Value'},
                {name: 'attributeUpper', label: 'Upper bound', hint: 'For between only.'},
                {name: 'modifiedFrom', label: 'Modified from', hint: 'ISO-8601, as in 2026-10-01T00:00:00Z.'},
                {name: 'modifiedTo', label: 'Modified to'},
                {
                    name: 'sortColumn',
                    label: 'Order by',
                    type: 'select',
                    options: ['', 'pk', 'sk', 'modified'],
                    value: '',
                    hint: 'Empty is the order the table is stored in.',
                },
                {name: 'sortDirection', label: 'Direction', type: 'select', options: ['asc', 'desc'], value: 'asc'},
            ],
            'Scan',
            values => {
                const name = String(values['attributeName'] ?? '').trim();
                const text = String(values['attributeValue'] ?? '');
                this.pageIndex = 0;
                this.request = {
                    mode: 'scan',
                    table: table.name,
                    pageSize: this.pageSize,
                    pageIndex: 0,
                    sortColumn: String(values['sortColumn'] ?? ''),
                    sortDirection: values['sortDirection'] === 'desc' ? 'desc' : 'asc',
                    modifiedFrom: String(values['modifiedFrom'] ?? '').trim(),
                    modifiedTo: String(values['modifiedTo'] ?? '').trim(),
                    attributeName: name,
                    attributeOperator: name ? String(values['attributeOperator'] ?? 'eq') as SortOperator : undefined,
                    // Typed the way the key it may be is declared, and left as text otherwise: an
                    // attribute is whatever was written, and the server compares it as what it is.
                    attributeValue: name ? typedAttribute(table, name, text) : undefined,
                    attributeUpper: name && values['attributeOperator'] === 'between'
                        ? typedAttribute(table, name, String(values['attributeUpper'] ?? ''))
                        : undefined,
                };
                this.scan();
            },
        );
    }

    /** Back to the whole table, which is where the page starts. */
    clearReading(): void {
        this.pageIndex = 0;
        this.request = {mode: 'scan', table: this.name, pageSize: this.pageSize, pageIndex: 0};
        this.scan();
    }

    // -- reading items -------------------------------------------------------------------------------

    /** One key attribute of an item, as text. A key is a string, a number or bytes; a cell is text. */
    keyValue(item: Item, key: string): string {
        const value = item.attributes?.[key];
        return value === null || value === undefined ? '-' : String(value);
    }

    /**
     * Everything about an item except its key, as JSON.
     *
     * An item is a free-form map, so there is no column per attribute to be had: two rows of the same
     * table need not carry the same fields. The key is already in its own columns, and what is left is
     * shown as what it is.
     */
    attributesOf(item: Item, table: TableDescription): string {
        const rest: Record<string, unknown> = {...(item.attributes ?? {})};
        delete rest[table.partitionKey];
        if (table.sortKey) {
            delete rest[table.sortKey];
        }
        return Object.keys(rest).length === 0 ? '-' : JSON.stringify(rest);
    }

    // -- changing things -----------------------------------------------------------------------------

    /** Re-counts the items, which the server counts rather than looks up. */
    refreshCount(): void {
        this.load();
    }

    deleteItem(table: TableDescription, item: Item): void {
        const key = keyOf(table, item);
        this.confirmThen(
            {
                title: 'Delete item',
                message: `Delete the item keyed ${JSON.stringify(key)} from ${table.name}? This cannot be undone.`,
            },
            this.ekvService.deleteItem(table.name, key),
            'Item deleted',
        );
    }

    /**
     * Deletes the table and leaves for the list.
     *
     * Every item goes with it, and the server keeps nothing - which is why the count is in the question
     * rather than left to be discovered.
     */
    deleteTable(table: TableDescription): void {
        this.confirmThen(
            {
                title: 'Delete table',
                message: `Delete ${table.name} and all ${table.itemCount} items in it? This cannot be undone.`,
            },
            this.ekvService.deleteTable(table.name),
            'Table deleted',
            () => void this.router.navigate(['/ekv-table-list']),
        );
    }

    /** Asks again for the page that is on screen, which is the same request with the paging it now has. */
    private scan(): void {
        this.store.dispatch(ekvTableDetailsActions.scan({
            request: {...this.request, table: this.name, pageSize: this.pageSize, pageIndex: this.pageIndex},
        }));
    }
}

/** The key that names one item: the partition value, and the sort value when the table has one. */
function keyOf(table: TableDescription, item: Item): Record<string, unknown> {
    const key: Record<string, unknown> = {[table.partitionKey]: item.attributes?.[table.partitionKey]};
    if (table.sortKey) {
        key[table.sortKey] = item.attributes?.[table.sortKey];
    }
    return key;
}

/**
 * One filter value, typed the way the attribute it names is.
 *
 * Only the two keys have a declared type; every other attribute is whatever was written into it, and a
 * number typed into the box for one is meant as a number. So a key is typed as the table declares it
 * and anything else is read as a number when it looks like one - which is the same guess the server
 * would have to make, made where the type is still known.
 */
function typedAttribute(table: TableDescription, name: string, text: string): unknown {
    if (name === table.partitionKey) {
        return keyValueOf(table.partitionKeyType, text);
    }
    if (name === table.sortKey) {
        return keyValueOf(table.sortKeyType, text);
    }
    const trimmed = text.trim();
    return trimmed !== '' && !Number.isNaN(Number(trimmed)) ? Number(trimmed) : text;
}

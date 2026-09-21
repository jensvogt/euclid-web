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
import {EkvService} from '../service/ekv.service';
import {ekvTableDetailsActions, ekvTableDetailsSelectors} from './state/ekv-table-details.state';

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

    /** The table this page is about, by name - which is what every EKV action takes. */
    name = '';

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
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

    private scan(): void {
        this.store.dispatch(ekvTableDetailsActions.scan({
            name: this.name,
            pageSize: this.pageSize,
            pageIndex: this.pageIndex,
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

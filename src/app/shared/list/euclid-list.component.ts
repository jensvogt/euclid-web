import {Directive, inject, OnDestroy, OnInit} from '@angular/core';
import {MatDialogConfig} from '@angular/material/dialog';
import {PageEvent} from '@angular/material/paginator';
import {Sort} from '@angular/material/sort';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';

import {SortColumn} from '../sorting/sorting.component';
import {AutoReloadComponent, MIN_AUTO_RELOAD_MS} from '../autoreload/auto-reload.component';
import {EuclidResourceComponent} from '../resource/euclid-resource.component';
import {ListFeature} from './list-feature';

/**
 * What every one of euclid's list views does: page, sort, narrow by prefix, reload on a timer.
 *
 * A base class rather than nine copies, because the behaviour is not what distinguishes a queue list
 * from a bucket list - the columns and the row actions are. A subclass declares its {@link feature} and
 * its {@link columns}, writes a template, and gets the rest.
 *
 * The query lives here as plain fields rather than being read back out of the store on every keystroke.
 * It is dispatched with each load, so the store still holds what the view is showing - which is what the
 * paginator and the prefix box bind to - but the view does not have to wait for a round trip through the
 * store to know what it is about to ask for.
 *
 * Acting on a row - confirming, asking for fields, reporting what the server said - is
 * {@link EuclidResourceComponent}'s, because a detail view does the same things to the same resources.
 */
@Directive()
export abstract class EuclidListComponent<T> extends EuclidResourceComponent implements OnInit, OnDestroy {

    protected readonly store = inject(Store);

    /** The store slice this view reads and writes. */
    abstract readonly feature: ListFeature<T>;

    /** The table's columns, in display order. */
    abstract readonly columns: string[];

    /**
     * What a sortable table column is called on the server, where the two differ.
     *
     * A column named for what it shows - "objects", "messages" - is often stored under something else, and
     * euclid sorts by its own name. A column absent from here is sent as it is named.
     */
    protected readonly sortFields: Record<string, string> = {};

    items$!: Observable<T[]>;
    total$!: Observable<number>;
    pageSize$!: Observable<number>;
    pageIndex$!: Observable<number>;

    // Paging, as awsmock-ui's lists present it.
    pageSizeOptions = [5, 10, 20, 50, 100];
    hidePageSize = false;
    showPageSizeOptions = true;
    showFirstLastButtons = true;
    disabled = false;

    // The query this view is showing.
    prefixValue = '';
    prefixSet = false;
    protected pageSize = 10;
    protected pageIndex = 0;
    protected sortColumn: SortColumn = {column: 'name', direction: 'asc'};

    /**
     * The ERN whose contents this view lists, for the views that list into a resource.
     *
     * Set from the route before the first load by a subclass that needs it - see the message and object
     * lists. Empty for the listings that page a namespace rather than a parent.
     */
    protected parent = '';

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        const selectors = this.feature.selectors;
        this.items$ = this.store.select(selectors.selectItems);
        this.total$ = this.store.select(selectors.selectTotal);
        this.pageSize$ = this.store.select(selectors.selectPageSize);
        this.pageIndex$ = this.store.select(selectors.selectPageIndex);

        this.sortColumn = this.feature.defaultSort;
        this.load();
        this.startAutoReload(autoReloadPeriod());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    /** Asks the server for the page this view is currently describing. */
    override load(): void {
        this.lastUpdate = new Date();
        this.store.dispatch(this.feature.actions.load({
            prefix: this.prefixValue,
            pageSize: this.pageSize,
            pageIndex: this.pageIndex,
            sortColumn: this.sortColumn.column,
            sortDirection: this.sortColumn.direction,
            parent: this.parent,
        }));
    }

    setPrefix(): void {
        this.prefixSet = this.prefixValue.length > 0;
        // Back to the first page: page four of the unfiltered list says nothing about the filtered one.
        this.pageIndex = 0;
        this.load();
    }

    unsetPrefix(): void {
        this.prefixValue = '';
        this.prefixSet = false;
        this.pageIndex = 0;
        this.load();
    }

    handlePageEvent(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
        this.load();
    }

    sortChange(sort: Sort): void {
        if (!sort.direction) {
            return;
        }
        this.sortColumn = {
            column: this.sortFields[sort.active] ?? sort.active,
            direction: sort.direction === 'asc' ? 'asc' : 'desc',
        };
        this.load();
    }

    /** The reload period, asked for and then applied without having to leave the page. */
    autoReload(): void {
        const dialogConfig = new MatDialogConfig();
        dialogConfig.disableClose = true;
        dialogConfig.autoFocus = true;
        dialogConfig.width = '20%';
        dialogConfig.minWidth = '280px';

        this.dialog.open(AutoReloadComponent, dialogConfig).afterClosed().subscribe(result => {
            if (result) {
                this.startAutoReload(parseInt(result, 10));
            }
        });
    }

    private startAutoReload(period: number): void {
        this.updateSubscription?.unsubscribe();
        this.updateSubscription = interval(Math.max(period, MIN_AUTO_RELOAD_MS)).subscribe(() => this.load());
    }
}

/** The configured reload period, or a minute when nothing sensible is configured. */
export function autoReloadPeriod(): number {
    const stored = parseInt(localStorage.getItem('autoReload') ?? '', 10);
    return Number.isFinite(stored) && stored >= MIN_AUTO_RELOAD_MS ? stored : 60000;
}

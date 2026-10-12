import {Directive, inject, OnDestroy, OnInit} from '@angular/core';
import {MatDialogConfig} from '@angular/material/dialog';
import {PageEvent} from '@angular/material/paginator';
import {Sort} from '@angular/material/sort';
import {Store} from '@ngrx/store';
import {distinctUntilChanged, interval, map, Observable, of, Subscription, switchMap, timer} from 'rxjs';

import {SortColumn} from '../sorting/sorting.component';
import {AutoReloadComponent, MIN_AUTO_RELOAD_MS} from '../autoreload/auto-reload.component';
import {EuclidResourceComponent} from '../resource/euclid-resource.component';
import {ListFeature} from './list-feature';

/**
 * How long a listing may take before the view says it is waiting.
 *
 * Long enough that an ordinary page never shows a spinner at all, short enough that a listing somebody is
 * actually waiting on does - a bucket with tens of thousands of objects takes seconds to count and page,
 * and silence for that long is indistinguishable from nothing having happened.
 */
export const SPINNER_DELAY_MS = 1000;

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
    /** Whether this view has been waiting long enough for the wait to be worth showing. */
    busy$!: Observable<boolean>;
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
        this.busy$ = this.store.select(selectors.selectLoading).pipe(
            // Delayed rather than immediate: a listing that answers in 80 milliseconds would otherwise
            // flash a spinner on every page, every sort and every auto-reload, which reads as a page that
            // cannot settle. A listing that takes a second is a different thing, and saying so is the
            // difference between "it is working on it" and "it is broken". Cancelled the moment the answer
            // arrives, because `switchMap` drops the timer that was counting towards showing it.
            switchMap((loading: boolean) => loading ? timer(SPINNER_DELAY_MS).pipe(map(() => true)) : of(false)),
            distinctUntilChanged(),
        );

        // Through the same mapping a clicked header goes through: a default named for the column it
        // sorts - "messages" - is as likely to be stored under another name as one somebody clicked,
        // and euclid sorts by the stored name. Without this the first page of a list would come back
        // in whatever order the database felt like while every later sort worked.
        this.sortColumn = this.serverSort(this.feature.defaultSort);
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
        this.sortColumn = this.serverSort({
            column: sort.active,
            direction: sort.direction === 'asc' ? 'asc' : 'desc',
        });
        this.load();
    }

    /** One sort, with the column named as the server stores it rather than as the table shows it. */
    private serverSort(sort: SortColumn): SortColumn {
        return {column: this.sortFields[sort.column] ?? sort.column, direction: sort.direction};
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

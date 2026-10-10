import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {Location} from '@angular/common';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIcon} from '@angular/material/icon';
import {MatTooltip} from '@angular/material/tooltip';
import {catchError, forkJoin, interval, map, Observable, of, Subscription} from 'rxjs';
import type {Module} from 'euclid-ndk';

import {EuclidHttpService, Page} from '../../services/euclid-http.service';
import {EuclidSessionService} from '../../services/euclid-session.service';
import {EmmService} from '../../modules/emm/service/emm.service';
import {FooterComponent} from '../footer/footer.component';
import {autoReloadPeriod} from '../list/euclid-list.component';
import {EuclidModule, ModuleResource, moduleOf} from '../metrics/euclid-modules';

/** One resource of this module, as the page shows it: what it is called, and how many there are. */
export interface ResourceCount {
    resource: ModuleResource;
    /** What the server said, or null when it could not be asked - which reads as a dash, not a zero. */
    count: number | null;
}

/** What EMM says the module itself is doing, beside what it holds. */
export interface ModuleStatus {
    running: number;
    maxInstances: number;
    active: boolean;
    desiredStopped: boolean;
    logLevel: string;
}

/**
 * One module's own dashboard: what it is running, and what it holds.
 *
 * One component for every module rather than ten pages, because the question is the same each time -
 * how many of each of these are there, and is the module itself up. What differs is a list of
 * resources, and that is data: see {@link EUCLID_MODULES}, where a resource is an action, the field
 * euclid names its array after, and the page to send somebody to.
 *
 * The counts are asked generically. Every listing in euclid answers `{total, <things>}`, so a paged one
 * is asked for a single row and read for its total; the few that answer with everything at once are
 * counted by what comes back. A count that fails is a dash rather than a zero and does not take the
 * page with it - one module being unreachable should not blank the other nine figures.
 */
@Component({
    selector: 'module-dashboard',
    templateUrl: './module-dashboard.component.html',
    styleUrls: ['./module-dashboard.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardContent, MatIconButton, MatIcon, MatTooltip, RouterLink, FooterComponent],
})
export class ModuleDashboardComponent implements OnInit, OnDestroy {

    lastUpdate: Date = new Date();

    target = '';
    module: EuclidModule | undefined;

    counts: ResourceCount[] = [];

    /** What EMM reports for this module, or undefined when it has nothing to say about it. */
    status: ModuleStatus | undefined;

    error = '';

    private readonly route = inject(ActivatedRoute);
    private readonly location = inject(Location);
    private readonly http = inject(EuclidHttpService);
    private readonly session = inject(EuclidSessionService);
    private readonly registry = inject(EmmService);

    private updateSubscription: Subscription | undefined;
    private loading: Subscription | undefined;

    ngOnInit(): void {
        this.target = this.route.snapshot.paramMap.get('target') ?? '';
        this.module = moduleOf(this.target);
        this.counts = (this.module?.resources ?? []).map(resource => ({resource: resource, count: null}));
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
        this.loading?.unsubscribe();
    }

    back(): void {
        this.location.back();
    }

    refresh(): void {
        this.load();
    }

    /** Reads every count and the module's own state, in one pass. */
    load(): void {
        const module = this.module;
        if (!module) {
            this.error = `No module ${this.target}.`;
            return;
        }
        this.lastUpdate = new Date();

        this.loading?.unsubscribe();
        this.loading = forkJoin({
            // `of([])` for a module with nothing to count: `forkJoin` of an empty array completes
            // without ever emitting, which would leave the whole page waiting on it.
            counts: module.resources.length > 0
                ? forkJoin(module.resources.map(resource => this.count(module.target, resource)))
                : of([] as (number | null)[]),
            status: this.statusOf(module.target),
        }).subscribe(({counts, status}) => {
            this.counts = module.resources.map((resource, index) => ({resource: resource, count: counts[index]}));
            this.status = status;
        });
    }

    /** Whether the module is running as asked - the one state worth colouring. */
    get unwell(): boolean {
        return this.status !== undefined && (!this.status.active || this.status.desiredStopped);
    }

    /**
     * How many of one resource there are.
     *
     * A single row for a paged listing, because the figure wanted is the `total` beside it rather than
     * the rows. Namespaces are the one listing scoped to an account, which is why a payload can carry
     * one at all.
     */
    private count(target: string, resource: ModuleResource): Observable<number | null> {
        const payload: Record<string, unknown> = resource.paged ? {pageSize: 1} : {};
        if (resource.perAccount) {
            payload['accountId'] = this.session.session?.accountId ?? '';
        }

        const counted = resource.paged
            ? this.http.page<unknown>(target, resource.action, resource.field, payload)
                .pipe(map((page: Page<unknown>) => page.total))
            : this.http.all<unknown>(target, resource.action, resource.field, payload)
                .pipe(map((items: unknown[]) => items.length));

        return counted.pipe(catchError(() => of(null)));
    }

    /**
     * What the manager says about this module.
     *
     * EMM names a module by its routing target in lower case, which is what every other call in this UI
     * uses too. A module the registry has never heard of - or a server that does not answer the registry
     * at all - leaves the panel off rather than failing the page.
     */
    private statusOf(target: string): Observable<ModuleStatus | undefined> {
        return this.registry.listModules().pipe(
            map((modules: Module[]) => {
                const module = modules.find((candidate: Module) => candidate.name === target);
                if (!module) {
                    return undefined;
                }
                return {
                    running: (module.instances ?? []).filter(instance => instance.state === 'RUNNING').length,
                    maxInstances: module.maxInstances,
                    active: module.active,
                    desiredStopped: module.desiredStopped,
                    logLevel: module.logLevel,
                };
            }),
            catchError(() => of(undefined)),
        );
    }
}

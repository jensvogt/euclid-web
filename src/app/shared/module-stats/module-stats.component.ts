import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {MatCard, MatCardContent} from '@angular/material/card';
import {catchError, forkJoin, interval, map, Observable, of, Subscription} from 'rxjs';
import type {Module} from 'euclid-ndk';

import {EuclidHttpService, Page} from '../../services/euclid-http.service';
import {EuclidSessionService} from '../../services/euclid-session.service';
import {EmmService} from '../../modules/emm/service/emm.service';
import {autoReloadPeriod} from '../list/euclid-list.component';
import {EuclidModule, ModuleResource, moduleOfRoute} from '../metrics/euclid-modules';

/** One resource of this module, as the band shows it: what it is called, and how many there are. */
export interface ResourceCount {
    resource: ModuleResource;
    /** What the server said, or null when it could not be asked - which reads as a dash, not a zero. */
    count: number | null;
    /** Whether this is the resource the page below is about, which is shown rather than linked. */
    current: boolean;
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
 * What a module is running and what it holds, above whatever page you are on.
 *
 * On every one of a module's list views, which is what there is instead of a dashboard for each module:
 * a count is only half an answer on its own - twelve buckets, and is ESM even up? - and the other counts
 * are how you get from one of a module's lists to the next. A page of nothing but counts in front of the
 * list somebody came for was a click that bought them nothing.
 *
 * Which module is worked out from the page's own URL, by looking for the resource whose list view this
 * is. That is one line in a template rather than a target repeated in twenty of them, and it cannot go
 * out of sync with {@link EUCLID_MODULES} the way a hand-written one would. A page the registry says
 * nothing about gets no band rather than an empty one.
 *
 * The counts are asked generically. Every listing in euclid answers `{total, <things>}`, so a paged one
 * is asked for a single row and read for its total; the few that answer with everything at once are
 * counted by what comes back. A count that fails is a dash rather than a zero and does not take the rest
 * of the band with it - one listing being refused should not blank the other four figures.
 */
@Component({
    selector: 'module-stats',
    templateUrl: './module-stats.component.html',
    styleUrls: ['./module-stats.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardContent, RouterLink],
})
export class ModuleStatsComponent implements OnInit, OnDestroy {

    module: EuclidModule | undefined;
    counts: ResourceCount[] = [];

    /** What EMM reports for this module, or undefined when it has nothing to say about it. */
    status: ModuleStatus | undefined;

    private readonly router = inject(Router);
    private readonly http = inject(EuclidHttpService);
    private readonly session = inject(EuclidSessionService);
    private readonly registry = inject(EmmService);

    private updateSubscription: Subscription | undefined;
    private loading: Subscription | undefined;

    ngOnInit(): void {
        this.module = moduleOfRoute(this.router.url);
        this.counts = (this.module?.resources ?? []).map(resource => ({
            resource: resource,
            count: null,
            current: this.isCurrent(resource),
        }));
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
        this.loading?.unsubscribe();
    }

    /** Whether the module is running as asked - the one state worth colouring. */
    get unwell(): boolean {
        return this.status !== undefined && (!this.status.active || this.status.desiredStopped);
    }

    /** Reads every count and the module's own state, in one pass. */
    load(): void {
        const module = this.module;
        if (!module) {
            return;
        }

        this.loading?.unsubscribe();
        this.loading = forkJoin({
            // `of([])` for a module with nothing to count: `forkJoin` of an empty array completes without
            // ever emitting, which would leave the band waiting on it.
            counts: module.resources.length > 0
                ? forkJoin(module.resources.map(resource => this.count(module.target, resource)))
                : of([] as (number | null)[]),
            status: this.statusOf(module.target),
        }).subscribe(({counts, status}) => {
            this.counts = module.resources.map((resource, index) => ({
                resource: resource,
                count: counts[index],
                current: this.isCurrent(resource),
            }));
            this.status = status;
        });
    }

    /**
     * Whether this resource is the one the page is about.
     *
     * By prefix, because a list view's details pages live under it: `/esm-bucket-list/objects/<ern>` is
     * still the page about buckets as far as this band is concerned.
     */
    private isCurrent(resource: ModuleResource): boolean {
        return !!resource.route && this.router.url.startsWith(resource.route);
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
     * at all - leaves the figures off rather than failing the page they sit on.
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

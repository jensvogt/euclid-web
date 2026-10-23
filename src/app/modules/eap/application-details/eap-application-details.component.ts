import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, map, Observable, Subscription} from 'rxjs';
import type {Application, EgressLimits, EgressSite, EgressSites} from 'euclid-ndk';

import {namespaceOf} from '../../../services/euclid-http.service';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag} from '../../../shared/tags/resource-tags.component';
import {EapService, EGRESS_ALL_SITES, LOG_LEVELS, STATE_RUNNING} from '../service/eap.service';
import {eapApplicationDetailsActions, eapApplicationDetailsSelectors} from './state/eap-application-details.state';

/**
 * One deployed application: what euclid runs, as what, how much of it, and what is answering now.
 *
 * `desiredState` against `state` is the thing to read first and the thing a list has no room for: the two
 * differing is the ordinary picture of an application starting, and the lasting picture of one that
 * cannot. The instances below say which of the two it is.
 *
 * Every action here asks rather than does - start, stop and restart record what is wanted and the manager
 * reconciles toward it - so a page that reloads immediately afterwards will usually still show the old
 * state. That is the server being honest rather than the request having failed.
 */
@Component({
    selector: 'eap-application-details',
    templateUrl: './eap-application-details.component.html',
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
        MatTabsModule,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EapApplicationDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    application$!: Observable<Application | null>;

    /** Instance ID to the machine it is on, as EMM's module registry reports it. */
    hosts$!: Observable<Record<string, string>>;
    environment$!: Observable<ResourceTag[]>;

    /** What the rate limiter holds this application to, and nothing when it could not be read. */
    egress$!: Observable<EgressSites | null>;

    /** Its sites, in name order so the table does not reshuffle itself on a reload. */
    egressSites$!: Observable<EgressSite[]>;

    error$!: Observable<string | null>;

    readonly instanceColumns = ['instanceId', 'pid', 'host', 'httpPort'];
    readonly environmentColumns = ['key', 'value', 'actions'];
    readonly resourceColumns = ['ern', 'actions'];
    readonly egressColumns = [
        'site', 'requestsPerSecond', 'burst', 'concurrent', 'limitsSet', 'tokens', 'inFlight', 'blockedUntil',
        'lastUsed', 'actions',
    ];

    /** The application this page is about. Nothing here renames one, so this does not change. */
    applicationId = '';

    protected readonly dateConversion = dateConversion;
    protected readonly namespaceOf = namespaceOf;
    protected readonly running = STATE_RUNNING;
    protected readonly allSites = EGRESS_ALL_SITES;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly eapService = inject(EapService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.applicationId = this.route.snapshot.paramMap.get('applicationId') ?? '';
        this.application$ = this.store.select(eapApplicationDetailsSelectors.selectApplication);
        this.hosts$ = this.store.select(eapApplicationDetailsSelectors.selectHosts);
        this.environment$ = this.application$.pipe(map(application => environmentOf(application)));
        this.egress$ = this.store.select(eapApplicationDetailsSelectors.selectEgress);
        this.egressSites$ = this.egress$.pipe(map(egress => egressSitesOf(egress)));
        this.error$ = this.store.select(eapApplicationDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.applicationId) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(eapApplicationDetailsActions.load({applicationId: this.applicationId}));
    }

    /**
     * Which machine an instance is on, as a cell.
     *
     * Beside the pid, because a pid alone does not identify a process here: every host runs the same
     * installation path and pids collide across machines as a matter of course.
     *
     * Three answers, and the difference between the last two matters. A named host is the worker that
     * reported it. An empty one is the manager's own host - what every instance on an installation with
     * no workers carries - and is named rather than left blank, so a column of them reads as "all here"
     * instead of "nobody knows". An instance the registry has no record of at all is the dash.
     */
    host(hosts: Record<string, string>, instanceId: string): string {
        const host = hosts[instanceId];
        if (host === undefined) {
            return '-';
        }
        return host.length > 0 ? host : 'manager';
    }

    /** The command line as it would be typed, which is what a `command` and its arguments amount to. */
    commandLine(application: Application): string {
        return [application.command, ...(application.arguments ?? [])].filter(part => part).join(' ') || '-';
    }

    // -- running it ----------------------------------------------------------------------------------

    /** Asks it to start, or to stop. The manager acts on it; the state follows on a later reload. */
    toggleApplication(application: Application): void {
        const running = application.state === STATE_RUNNING;
        this.run(
            running
                ? this.eapService.stopApplication(application.applicationId)
                : this.eapService.startApplication(application.applicationId),
            running ? 'Asked to stop' : 'Asked to start',
        );
    }

    /** Cycles the instances. What comes back is the pool about to be cycled, not the one that came back. */
    restartApplication(application: Application): void {
        this.confirmThen(
            {
                title: 'Restart',
                message: `Stop and start the ${application.instances} instances of ${application.applicationId}? They go one pool at a time, so it is not instant.`,
                confirm: 'Restart',
            },
            this.eapService.restartApplication(application.applicationId),
            'Restart requested',
        );
    }

    /**
     * Points it at a new build of itself.
     *
     * Both fields default to what is deployed, which is what a rebuilt artifact stored under the same key
     * wants. A redeploy that would change neither the version nor the checksum is refused by the server
     * rather than restarting the instances for nothing.
     */
    redeployApplication(application: Application): void {
        this.addThen(
            'Redeploy ' + application.applicationId,
            [
                {name: 'artifact', label: 'Artifact key', value: application.artifactKey},
                {name: 'version', label: 'Version', value: application.version},
            ],
            values => this.eapService.redeployApplication(
                application.applicationId,
                String(values['artifact']),
                String(values['version']),
            ),
            'Redeploy requested',
            'Redeploy',
        );
    }

    /** How many instances the manager keeps. Both at once, since the pair has to make sense together. */
    setScale(application: Application): void {
        this.addThen(
            'Instances of ' + application.applicationId,
            [
                {name: 'minInstances', label: 'Minimum', type: 'number', required: true, value: application.minInstances},
                {
                    name: 'maxInstances',
                    label: 'Maximum',
                    type: 'number',
                    required: true,
                    value: application.maxInstances,
                    hint: 'The manager keeps at least the minimum and never more than the maximum.',
                },
            ],
            values => this.eapService.updateApplication(application.applicationId, {
                minInstances: Number(values['minInstances']),
                maxInstances: Number(values['maxInstances']),
            }),
            'Instance count changed',
            'Save',
        );
    }

    /** An empty level takes the override back, which is what the server reads it as. */
    setLogLevel(application: Application): void {
        this.addThen(
            'Log level for ' + application.applicationId,
            [{
                name: 'level',
                label: 'Level',
                type: 'select',
                options: ['', ...LOG_LEVELS],
                value: application.logLevel,
                hint: "Empty puts it back under the installation's own logging configuration.",
            }],
            values => this.eapService.setLogLevel(application.applicationId, String(values['level'])),
            'Log level changed',
            'Save',
        );
    }

    /**
     * Deletes the application and leaves for the list.
     *
     * The server does not stop it first, so a running application is worth saying out loud - and
     * reloading afterwards is the one thing this must not do, since the application is gone.
     */
    deleteApplication(application: Application): void {
        this.confirmThen(
            {
                title: 'Delete application',
                message: application.state === STATE_RUNNING
                    ? `${application.applicationId} is running with ${application.instances} instances, and deleting does not stop it first. Delete anyway?`
                    : `Delete ${application.applicationId}? This cannot be undone.`,
            },
            this.eapService.deleteApplication(application.applicationId),
            'Application deleted',
            () => void this.router.navigate(['/eap-application-list']),
        );
    }

    // -- environment ---------------------------------------------------------------------------------

    /**
     * Adds or changes one environment variable.
     *
     * The whole map is sent because that is what `update-application` takes - a field it is given is the
     * field's new value, not an addition to it - so the one being set is merged into what is there now
     * and the result goes back. An instance already running keeps the environment it started with: a
     * process's environment is fixed when it starts, whatever the row says afterwards.
     */
    setVariable(application: Application, variable?: ResourceTag): void {
        this.addThen(
            variable ? 'Edit ' + variable.key : 'Add a variable to ' + application.applicationId,
            variable
                ? [{name: 'value', label: 'Value', value: variable.value}]
                : [
                    {name: 'key', label: 'Name', required: true},
                    {name: 'value', label: 'Value'},
                ],
            values => this.eapService.updateApplication(application.applicationId, {
                environment: {
                    ...(application.environment ?? {}),
                    [variable ? variable.key : String(values['key'])]: String(values['value']),
                },
            }),
            variable ? 'Variable changed' : 'Variable added',
            variable ? 'Save' : 'Add',
        );
    }

    // -- egress rate limiting ------------------------------------------------------------------------

    /**
     * What a site with no limit of its own is held to: this application's own `*`, or the installation's.
     *
     * Two fallbacks deep because the server has two. Saying which of them is in force matters more than
     * the numbers do - "inherited" on a row is only readable next to what it was inherited from.
     */
    egressFallback(egress: EgressSites): {limits: EgressLimits; source: string} | null {
        const own = (egress.sites ?? []).find(site => site.site === EGRESS_ALL_SITES);
        if (own) {
            return {limits: own.limits, source: "this application's own default"};
        }
        if (egress.defaultLimits) {
            return {limits: egress.defaultLimits, source: "the installation's default"};
        }
        return null;
    }

    /** One set of limits in a sentence, which is what a note wants and a row of columns does not. */
    egressLimits(limits: EgressLimits): string {
        return `${limits.requestsPerSecond}/s, burst ${limits.burst}, ${limits.concurrent} at once`;
    }

    /**
     * A column that means nothing for the `*` row, as a dash. Otherwise the figure, read to two places.
     *
     * Nobody acquires a permit for `*` - it is a set of numbers other sites fall back to - so its bucket
     * is never drawn on and its slots are never held. The server reports those as zero, and a zero in a
     * column of real readings is a claim about a bucket rather than the absence of one.
     *
     * Rounded because one of these two columns is not a count. Tokens is the level of a bucket that
     * refills continuously - the server adds `elapsed seconds x rate` to it and takes exactly one away
     * per request - so a reading between two whole numbers is the ordinary case, and the seventeen digits
     * a double prints in full are an artefact of adding fractions in binary rather than a figure anybody
     * means. Two places is as fine as this is worth reading; a whole number still shows as one.
     */
    egressState(site: EgressSite, value: number): string {
        if (site.site === EGRESS_ALL_SITES) {
            return '-';
        }
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }

    /**
     * Sets what this application may do to one site.
     *
     * All three numbers are asked for and all three are sent, even though the server changes only what it
     * is given: the dialog shows what the site is held to now, so leaving a field alone and leaving it out
     * come to the same thing. A site is typed only when adding one - editing a row names it in the title,
     * because changing the host here would set a limit on a different site rather than move this one.
     */
    setEgressLimit(application: Application, site?: EgressSite): void {
        const limits = site?.limits;
        this.addThen(
            site ? 'Egress limit for ' + site.site : 'Egress limit on ' + application.applicationId,
            [
                ...(site ? [] : [{
                    name: 'site',
                    label: 'Site',
                    required: true,
                    hint: `A host name, or ${EGRESS_ALL_SITES} for every site without a limit of its own.`,
                }]),
                {
                    name: 'requestsPerSecond',
                    label: 'Requests per second',
                    type: 'number',
                    required: true,
                    value: limits?.requestsPerSecond ?? 0,
                    hint: 'The rate the bucket refills at.',
                },
                {
                    name: 'burst',
                    label: 'Burst',
                    type: 'number',
                    required: true,
                    value: limits?.burst ?? 0,
                    hint: 'How many the bucket holds, so a site left alone can be called this many at once.',
                },
                {
                    name: 'concurrent',
                    label: 'Concurrent',
                    type: 'number',
                    required: true,
                    value: limits?.concurrent ?? 0,
                    hint: 'Requests in flight at one time, whatever the rate allows.',
                },
            ],
            values => this.eapService.setEgressLimit(
                application.applicationId,
                site ? site.site : String(values['site']).trim(),
                {
                    requestsPerSecond: Number(values['requestsPerSecond']),
                    burst: Number(values['burst']),
                    concurrent: Number(values['concurrent']),
                },
            ),
            site ? 'Egress limit changed' : 'Egress limit set',
            'Save',
        );
    }

    /**
     * Takes a site's own limit away, so it falls back to the application's `*` or the installation default.
     *
     * Offered on every row rather than only the ones that have a limit of their own: `limitsSet` is what
     * says which those are, and a button that is there or not depending on a field is a button that
     * disappears for the wrong reason the day the field does. A site with nothing to remove is refused by
     * the server with its own 404, which reaches the snackbar.
     */
    deleteEgressLimit(application: Application, site: EgressSite): void {
        this.confirmThen(
            {
                title: 'Delete egress limit',
                message: `Take ${site.site} back to what ${application.applicationId} is allowed without a`
                    + ' limit of its own? The bucket is left as it stands - the tokens, the requests in'
                    + ' flight and any block all survive, so the site cannot be overrun by tidying this up.',
            },
            this.eapService.deleteEgressLimit(application.applicationId, site.site),
            'Egress limit deleted',
        );
    }

    deleteVariable(application: Application, variable: ResourceTag): void {
        const environment = {...(application.environment ?? {})};
        delete environment[variable.key];

        this.confirmThen(
            {
                title: 'Delete variable',
                message: `Remove ${variable.key} from ${application.applicationId}? Instances already running keep it until they are restarted.`,
            },
            this.eapService.updateApplication(application.applicationId, {environment: environment}),
            'Variable deleted',
        );
    }
}

/**
 * An application's environment, as rows, ordered by name.
 *
 * Built once per answer the store hands out rather than in the template, because `mat-table` takes the
 * rows by reference - see
 * {@link import("../../../shared/tags/resource-tags.component.js").ResourceTagsComponent}.
 */
function environmentOf(application: Application | null): ResourceTag[] {
    return Object.entries(application?.environment ?? {})
        .map(([key, value]) => ({key: key, value: String(value)}))
        .sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * The egress sites, as rows.
 *
 * `*` first and the rest by name: it is not a site but what the others fall back to, so it belongs at the
 * top of the list it governs rather than wherever an asterisk happens to sort. Built once per answer the
 * store hands out rather than in the template, since `mat-table` takes its rows by reference.
 */
function egressSitesOf(egress: EgressSites | null): EgressSite[] {
    return [...(egress?.sites ?? [])].sort((left, right) => {
        if (left.site === EGRESS_ALL_SITES) {
            return -1;
        }
        if (right.site === EGRESS_ALL_SITES) {
            return 1;
        }
        return left.site.localeCompare(right.site);
    });
}

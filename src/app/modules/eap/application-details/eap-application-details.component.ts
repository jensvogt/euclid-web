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
import type {Application} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag} from '../../../shared/tags/resource-tags.component';
import {EapService, LOG_LEVELS, STATE_RUNNING} from '../service/eap.service';
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
    environment$!: Observable<ResourceTag[]>;
    error$!: Observable<string | null>;

    readonly instanceColumns = ['instanceId', 'pid', 'httpPort'];
    readonly environmentColumns = ['key', 'value', 'actions'];
    readonly resourceColumns = ['ern', 'actions'];

    /** The application this page is about. Nothing here renames one, so this does not change. */
    applicationId = '';

    protected readonly dateConversion = dateConversion;
    protected readonly running = STATE_RUNNING;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly eapService = inject(EapService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.applicationId = this.route.snapshot.paramMap.get('applicationId') ?? '';
        this.application$ = this.store.select(eapApplicationDetailsSelectors.selectApplication);
        this.environment$ = this.application$.pipe(map(application => environmentOf(application)));
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

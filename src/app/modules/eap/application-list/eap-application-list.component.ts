import {Component, inject} from '@angular/core';
import {defer, mergeMap, Observable} from 'rxjs';
import type {Application, RebalanceResult} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {FieldValue} from '../../../shared/resource-add/resource-add.component';
import {bucketNameOf, EsmService} from '../../esm/service/esm.service';
import {
    DEFAULT_MAX_INSTANCES,
    DEFAULT_MIN_INSTANCES,
    EapService,
    LOG_LEVELS,
    RUNTIMES,
    RUNTIME_JAVA,
    STATE_RUNNING,
} from '../service/eap.service';
import {eapApplicationListFeature} from './state/eap-application-list.state';

/**
 * What the artifact picker offers, which is every runtime euclid can start something in.
 *
 * A filter rather than a rule: the server takes whatever bytes it is given, and a `*` entry would turn
 * the picker into a file manager. Anything not listed is still reachable - every picker lets a person
 * widen it - so this is a default, not a refusal.
 */
const ARTIFACT_TYPES = '.jar,.war,.zip,.tar,.tar.gz,.tgz,.py,.js,.mjs,.cjs';

/** The deployed applications, and how many instances are currently answering for each. */
@Component({
    selector: 'eap-application-list',
    templateUrl: './eap-application-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EapApplicationListComponent extends EuclidListComponent<Application> {

    override readonly feature: ListFeature<Application> = eapApplicationListFeature;
    override readonly columns = [
        'applicationId', 'runtime', 'version', 'state', 'desiredState', 'instances', 'logLevel', 'modified', 'actions',
    ];

    protected readonly dateConversion = dateConversion;
    protected readonly STATE_RUNNING = STATE_RUNNING;

    /** The artifact's bucket is ESM's, so putting a build there is ESM's call rather than EAP's. */
    private readonly esmService = inject(EsmService);

    constructor(private readonly eapService: EapService) {
        super();
    }

    /** The bucket is a name and the artifact a key within it, which is what the server takes. */
    createApplication(): void {
        this.addThen(
            'Deploy application',
            [
                {name: 'applicationId', label: 'Application ID', required: true},
                {name: 'runtime', label: 'Runtime', type: 'select', options: RUNTIMES, value: RUNTIME_JAVA},
                {name: 'bucket', label: 'Artifact bucket', required: true, hint: 'A bucket name, not an ERN.'},
                {name: 'artifact', label: 'Artifact key', required: true, hint: 'The object key within that bucket.'},
                {name: 'version', label: 'Version', hint: 'Taken from the artifact name when left empty.'},
                {name: 'command', label: 'Command', hint: 'Optional override of the runtime default.'},
                {name: 'minInstances', label: 'Min instances', type: 'number', value: DEFAULT_MIN_INSTANCES},
                {name: 'maxInstances', label: 'Max instances', type: 'number', value: DEFAULT_MAX_INSTANCES},
            ],
            values => this.eapService.createApplication(
                String(values['applicationId']),
                String(values['runtime']),
                String(values['bucket']),
                String(values['artifact']),
                {
                    version: String(values['version']),
                    command: String(values['command']),
                    minInstances: Number(values['minInstances']),
                    maxInstances: Number(values['maxInstances']),
                },
            ),
            'Application deployed',
        );
    }

    /**
     * Asks for the application to start or stop.
     *
     * Asking is all it does: the desired state changes and the manager acts on it, so the row will still say
     * STOPPED until the next reload picks up what actually happened.
     */
    toggleApplication(application: Application): void {
        const running = application.state === STATE_RUNNING;
        this.run(
            running
                ? this.eapService.stopApplication(application.applicationId)
                : this.eapService.startApplication(application.applicationId),
            running ? 'Stop requested' : 'Start requested',
        );
    }

    /**
     * A new build of the same application: a local file, or an artifact already in its bucket.
     *
     * Both, because a deployment is two things and only one of them is EAP's. The bytes live in the
     * application's own bucket, so a build on somebody's machine has to be put there first and the
     * redeploy then names its key - which is why this dialog has a file picker and why choosing a file
     * makes the call three: upload, wait for the server to settle the object, redeploy.
     */
    redeploy(application: Application): void {
        this.addThen(
            'Redeploy ' + application.applicationId,
            [
                {
                    name: 'file',
                    label: 'Artifact file',
                    type: 'file',
                    accept: ARTIFACT_TYPES,
                    hint: `Uploaded into ${bucketNameOf(application.bucketErn)}, the application's own bucket.`
                        + ' Leave it empty to redeploy an artifact that is already there.',
                },
                {
                    name: 'artifact',
                    label: 'Artifact key',
                    hint: `Empty takes the chosen file's name, or keeps ${application.artifactKey || 'what is deployed'}.`,
                },
                {name: 'version', label: 'Version', hint: 'Empty takes it from the artifact name, as in app-1.4.0.jar.'},
                {
                    name: 'force',
                    label: 'Redeploy even if the bytes have not changed',
                    type: 'boolean',
                    hint: 'The server refuses a redeploy of the build already running unless this is set.',
                },
            ],
            values => this.deploy(application, values),
            'Redeploy requested',
            'Redeploy',
        );
    }

    /**
     * Asks for the instances to be moved to where placement would put them now.
     *
     * Behind a confirmation because it restarts instances, one at a time: each move stops one and starts
     * its replacement on the better node, so the pool runs at most one instance short while that happens.
     * Worth a nod rather than a dialog - there is nothing to fill in, and a pool that is already balanced
     * is left exactly as it is.
     *
     * What comes back says whether the request was recorded, not that anything has moved, so the snackbar
     * reports that rather than claiming the pool has been spread. A job is refused by the server with its
     * own sentence, which lands in the snackbar the way every other refusal does.
     */
    rebalance(application: Application): void {
        this.confirmThen(
            {
                title: 'Rebalance',
                message: `Move ${application.applicationId}'s instances to where placement would put them now?`
                    + ' One moves at a time, each stopping an instance and starting its replacement on the'
                    + ' better node, so the pool runs at most one short while it happens. A pool that is'
                    + ' already balanced is left as it is.',
                confirm: 'Rebalance',
            },
            this.eapService.rebalanceApplication(application.applicationId),
            (result: RebalanceResult) => result.rebalancing
                ? `Rebalance requested, with ${result.instances} instances running`
                : 'The server did not start a rebalance',
        );
    }

    /**
     * What the redeploy dialog does with what it was given.
     *
     * The key is the one piece that is decided here rather than typed: a chosen file goes up under its
     * own name, because the version is read from the artifact name when none is given and a build called
     * `app-1.5.0.jar` already says which version it is. A key typed into the dialog wins over both.
     *
     * The wait between the upload and the redeploy is not politeness - EAP refuses an artifact that is
     * still being written, since the checksum on the row is still the old build's. See
     * {@link EsmService.awaitSettled}.
     */
    private deploy(application: Application, values: Record<string, FieldValue>): Observable<unknown> {
        const chosen = values['file'];
        const file = chosen instanceof File ? chosen : null;
        const key = String(values['artifact'] ?? '').trim() || file?.name || application.artifactKey;
        const version = String(values['version'] ?? '').trim();
        const force = values['force'] === true;

        const redeploy = () => this.eapService.redeployApplication(application.applicationId, key, version, force);
        if (!file) {
            return redeploy();
        }

        // `defer`, so the snackbar is opened when somebody is waiting on the upload rather than when the
        // chain is built. The one that reports the outcome replaces it.
        return defer(() => {
            this.snackBar.open(`Uploading ${file.name} (${byteConversion(file.size)})...`, '', {duration: 0});
            return this.esmService.uploadFile(application.bucketErn, key, file);
        }).pipe(
            mergeMap(() => this.esmService.awaitSettled(application.bucketErn, key)),
            mergeMap(redeploy),
        );
    }

    /** Changes what one application logs at, without restarting or redeploying it. */
    setLogLevel(application: Application): void {
        this.addThen(
            'Log level for ' + application.applicationId,
            [{
                name: 'level',
                label: 'Level',
                type: 'select',
                options: LOG_LEVELS,
                value: application.logLevel || 'info',
            }],
            values => this.eapService.setLogLevel(application.applicationId, String(values['level'])),
            'Log level changed',
        );
    }

    resetLogLevel(application: Application): void {
        this.run(this.eapService.resetLogLevel(application.applicationId), 'Log level reset');
    }

    /** Deleting does not stop it first, so the confirmation says so when it is still running. */
    deleteApplication(application: Application): void {
        this.confirmThen(
            {
                title: 'Delete application',
                message: application.state === STATE_RUNNING
                    ? `${application.applicationId} is running, and deleting does not stop it. Stop it first.`
                    : `Delete ${application.applicationId}? This cannot be undone.`,
            },
            this.eapService.deleteApplication(application.applicationId),
            'Application deleted',
        );
    }

    /** Where the instances are answering, for the tooltip on the instance count. */
    endpoints(application: Application): string {
        const endpoints = application.endpoints ?? [];
        if (endpoints.length === 0) {
            return 'No instances answering';
        }
        return endpoints.map(endpoint => `pid ${endpoint.pid} on port ${endpoint.httpPort}`).join(', ');
    }
}

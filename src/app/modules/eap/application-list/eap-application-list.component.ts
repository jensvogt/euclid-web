import {Component} from '@angular/core';
import type {Application} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
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
    override readonly columns = ['applicationId', 'runtime', 'version', 'state', 'instances', 'logLevel', 'modified', 'actions'];

    protected readonly dateConversion = dateConversion;
    protected readonly STATE_RUNNING = STATE_RUNNING;

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

    /** A new build of the same application, under the artifact already deployed unless another is named. */
    redeploy(application: Application): void {
        this.addThen(
            'Redeploy ' + application.applicationId,
            [
                {name: 'artifact', label: 'Artifact key', hint: 'Empty keeps the artifact already deployed.'},
                {name: 'version', label: 'Version', hint: 'Empty takes it from the artifact name.'},
            ],
            values => this.eapService.redeployApplication(
                application.applicationId,
                String(values['artifact']),
                String(values['version']),
            ),
            'Redeploy requested',
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

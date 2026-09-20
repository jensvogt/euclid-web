import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Application, RestartResult} from 'euclid-ndk';

import {EuclidHttpService, Page} from '../../../services/euclid-http.service';

export const TARGET = 'eap';

export const RUNTIME_JAVA = 'JAVA';
export const RUNTIME_PYTHON = 'PYTHON';
export const RUNTIME_NODEJS = 'NODEJS';
export const RUNTIME_BINARY = 'BINARY';
export const RUNTIMES = [RUNTIME_JAVA, RUNTIME_PYTHON, RUNTIME_NODEJS, RUNTIME_BINARY];

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warning', 'error', 'fatal', 'off'];

export const STATE_RUNNING = 'RUNNING';
export const STATE_STOPPED = 'STOPPED';

export const DEFAULT_MIN_INSTANCES = 1;
export const DEFAULT_MAX_INSTANCES = 1;
export const DEFAULT_READY_TIMEOUT_MS = 30000;

/** EAP - euclid's application platform: deployed applications and the instances answering for them. */
@Injectable({providedIn: 'root'})
export class EapService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /**
     * The applications whose ID starts with a prefix, as a page.
     *
     * EAP answers with every match at once - an installation has tens of applications rather than thousands -
     * so the page a list view needs is cut here. Sorting and paging are therefore local to the browser for
     * this module, unlike the eight that page at the server.
     */
    listApplications(prefix = '', pageSize = 10, pageIndex = 0, sortColumn = 'applicationId', sortDirection: 'asc' | 'desc' = 'asc'): Observable<Page<Application>> {
        return this.http.all<Application>(TARGET, 'list-applications', 'applications', {prefix: prefix}).pipe(
            map((items: Application[]) => {
                const sorted = [...items].sort((left, right) => compare(left, right, sortColumn));
                if (sortDirection === 'desc') {
                    sorted.reverse();
                }
                return {
                    total: items.length,
                    items: sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
                };
            }),
        );
    }

    getApplication(applicationId: string): Observable<Application> {
        return this.http.call<Application>(TARGET, 'get-application', {applicationId: applicationId});
    }

    /**
     * Creates an application from an artifact already in a bucket.
     *
     * `bucket` is a bucket name rather than an ERN, and `artifact` the object key within it - which is what
     * the server takes, so it is what the dialog asks for.
     */
    createApplication(
        applicationId: string,
        runtime: string,
        bucket: string,
        artifact: string,
        options: {version?: string; command?: string; minInstances?: number; maxInstances?: number} = {},
    ): Observable<unknown> {
        return this.http.call(TARGET, 'create-application', {
            applicationId: applicationId,
            runtime: runtime,
            bucket: bucket,
            artifact: artifact,
            version: options.version ?? '',
            command: options.command ?? '',
            arguments: [],
            environment: {},
            buckets: [],
            queues: [],
            user: '',
            minInstances: options.minInstances ?? DEFAULT_MIN_INSTANCES,
            maxInstances: options.maxInstances ?? DEFAULT_MAX_INSTANCES,
            readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
        });
    }

    /**
     * Asks for an application to start.
     *
     * Asking is all it does: the desired state changes and the manager acts on it, so the application that
     * comes back is usually still `STOPPED`. The list will show it running on the next reload.
     */
    startApplication(applicationId: string): Observable<unknown> {
        return this.http.call(TARGET, 'start-application', {applicationId: applicationId});
    }

    stopApplication(applicationId: string): Observable<unknown> {
        return this.http.call(TARGET, 'stop-application', {applicationId: applicationId});
    }

    /** Points an application at a new build of itself. The artifact defaults to the one already deployed. */
    redeployApplication(applicationId: string, artifact = '', version = ''): Observable<unknown> {
        const payload: Record<string, unknown> = {applicationId: applicationId};
        if (artifact) {
            payload['artifact'] = artifact;
        }
        if (version) {
            payload['version'] = version;
        }
        return this.http.call(TARGET, 'redeploy-application', payload);
    }

    /**
     * Cycles the instances.
     *
     * Asking, like starting and stopping: the request is recorded and the manager stops and starts the
     * pool on its next reconcile, so what comes back says how many instances were running when it was
     * asked rather than how many came back.
     */
    restartApplication(applicationId: string): Observable<RestartResult> {
        return this.http.call<RestartResult>(TARGET, 'restart-application', {applicationId: applicationId});
    }

    /**
     * Changes a deployed application, and only what is named.
     *
     * The server reads a field that is absent as "leave it alone", which is why this takes the changes
     * rather than the application: sending a whole application back would set every field to whatever the
     * page happened to be showing.
     */
    updateApplication(applicationId: string, changes: Record<string, unknown>): Observable<Application> {
        return this.http.call<Application>(TARGET, 'update-application', {
            applicationId: applicationId,
            ...changes,
        });
    }

    /** Removes an application. Stop it first - this does not. */
    deleteApplication(applicationId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-application', {applicationId: applicationId});
    }

    /** Changes what one application logs at, without restarting or redeploying it. */
    setLogLevel(applicationId: string, level: string): Observable<unknown> {
        return this.http.call(TARGET, 'set-log-level', {applicationId: applicationId, level: level});
    }

    /**
     * Puts an application back under the installation's own logging configuration.
     *
     * An empty level rather than a `reset-log-level` action, because there is no such action: setting no
     * level is what removes the override, and the application follows the configuration as it changes
     * from there on.
     */
    resetLogLevel(applicationId: string): Observable<unknown> {
        return this.setLogLevel(applicationId, '');
    }
}

/** Orders two applications by one of their fields, numerically where the field is a number. */
function compare(left: Application, right: Application, column: string): number {
    const a = (left as unknown as Record<string, unknown>)[column];
    const b = (right as unknown as Record<string, unknown>)[column];
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    return String(a ?? '').localeCompare(String(b ?? ''));
}

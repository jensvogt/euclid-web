import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Application, RebalanceResult, RestartResult, WorkerNode, WorkerNodeDetails} from 'euclid-ndk';

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

    // -- worker nodes --------------------------------------------------------------------------

    /**
     * The worker nodes registered to this account, live or not.
     *
     * A node registers itself and renews a lease, so this is the fleet as it has reported itself rather
     * than anything configured here - and a node that stopped renewing stays in the listing with
     * `live: false`, which is what tells an absent host from a deregistered one.
     *
     * Paged and filtered here, as {@link listApplications} is: `list-nodes` answers with every node at
     * once, since an installation has tens of hosts rather than thousands. It takes no prefix either, so
     * the prefix box narrows by name on this side.
     *
     * Not scoped by namespace, unlike an application listing: a host belongs to the account and runs
     * whatever it is given.
     */
    listNodes(prefix = '', pageSize = 10, pageIndex = 0, sortColumn = 'name', sortDirection: 'asc' | 'desc' = 'asc'): Observable<Page<WorkerNode>> {
        return this.http.all<WorkerNode>(TARGET, 'list-nodes', 'nodes').pipe(
            map((nodes: WorkerNode[]) => {
                const matching = prefix ? nodes.filter(node => node.name.startsWith(prefix)) : nodes;
                const sorted = [...matching].sort((left, right) => compare(left, right, sortColumn));
                if (sortDirection === 'desc') {
                    sorted.reverse();
                }
                return {
                    total: matching.length,
                    items: sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
                };
            }),
        );
    }

    /** One node, and what it is holding slots for. A listing leaves the applications off; this does not. */
    getNode(node: string): Observable<WorkerNodeDetails> {
        return this.http.call<WorkerNodeDetails>(TARGET, 'get-node', {node: node});
    }

    /**
     * Stops new instances being placed on a node, and lets the ones it has leave as they are replaced.
     *
     * Not a stop: the node keeps running what it has and keeps renewing its lease, so the pool drifts off
     * it rather than going down with it. `drained: false` puts it back into service.
     */
    drainNode(node: string, drained = true): Observable<unknown> {
        return this.http.call(TARGET, 'drain-node', {node: node, drained: drained});
    }

    /**
     * Removes a node's registration, which is how its name is freed for another host.
     *
     * Administrator only, and it stops nothing: a worker still running registers itself again on its next
     * renewal. Taking a host out of service is draining it, then stopping the worker, then this.
     */
    deleteNode(node: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-node', {node: node});
    }

    // -- applications --------------------------------------------------------------------------

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

    /**
     * Points an application at a new build of itself. The artifact defaults to the one already deployed.
     *
     * The server refuses a redeploy whose artifact hashes the same as the one running, because a
     * deployment that changes no bytes is a restart dressed up as one. `force` is for the cases where
     * that is the point: putting a deleted artifact back, or restarting a pool onto the same build after
     * a host lost its copy.
     */
    redeployApplication(applicationId: string, artifact = '', version = '', force = false): Observable<unknown> {
        const payload: Record<string, unknown> = {applicationId: applicationId};
        if (artifact) {
            payload['artifact'] = artifact;
        }
        if (version) {
            payload['version'] = version;
        }
        if (force) {
            payload['force'] = true;
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
     * Moves the instances to where placement would put them now.
     *
     * Onto a node that has joined since they were placed, off one holding more than its share for the cores
     * it has, and off one that is drained, no longer live or no longer matches the application's node
     * labels. The manager does this by itself after an instance goes away; this is for every other time - a
     * new node, or a pool that ended up lopsided and was never scaled since.
     *
     * Asking, like restarting: the request is recorded and nothing has moved when it answers. One instance
     * moves per pass, each move stopping one and starting its replacement on the better node, so the pool
     * is at most one instance short while a move is under way and a pool already balanced is left exactly
     * as it is. Nothing else is restarted.
     *
     * Refused with HTTP 400 for a job, since moving one of its runs would start that run again - the
     * server's own refusal, which is what reaches the snackbar.
     */
    rebalanceApplication(applicationId: string): Observable<RebalanceResult> {
        return this.http.call<RebalanceResult>(TARGET, 'rebalance-application', {applicationId: applicationId});
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

/** Orders two records by one of their fields, numerically where the field is a number. */
function compare(left: object, right: object, column: string): number {
    const a = (left as unknown as Record<string, unknown>)[column];
    const b = (right as unknown as Record<string, unknown>)[column];
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    return String(a ?? '').localeCompare(String(b ?? ''));
}

import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {TransferServer} from 'euclid-ndk';

import {EuclidHttpService, Page} from '../../../services/euclid-http.service';

export const TARGET = 'ets';

/** What a transfer server speaks. SFTP unless somebody asks for the other one. */
export const PROTOCOL_FTP = 'FTP';
export const PROTOCOL_SFTP = 'SFTP';
export const PROTOCOLS = [PROTOCOL_SFTP, PROTOCOL_FTP];

/** The address a server binds unless the deployment narrows it. */
export const DEFAULT_ADDRESS = '0.0.0.0';

/** The passive-mode range an FTP server hands out, which a firewall has to allow through. */
export const DEFAULT_PASV_MIN = 50000;
export const DEFAULT_PASV_MAX = 51000;

/** `RUNNING` or `STOPPED`, the same words EAP uses for an application. */
export const STATE_RUNNING = 'RUNNING';

/**
 * ETS - euclid's transfer servers: FTP and SFTP in front of a bucket.
 *
 * A server is a listener and a set of rules about who may log in; the files a client sees are a
 * bucket's objects. So nothing here moves data - ESM already holds it - and what this module decides is
 * who reaches it, over which protocol, and starting from which prefix.
 */
@Injectable({providedIn: 'root'})
export class EtsService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /**
     * The transfer servers whose ID starts with a prefix, as a page.
     *
     * ETS answers with every match at once, as EAP does - an installation has a handful of transfer
     * servers - so the page a list view needs is cut here, and the sorting with it.
     */
    listServers(prefix = '', pageSize = 10, pageIndex = 0, sortColumn = 'serverId', sortDirection: 'asc' | 'desc' = 'asc'): Observable<Page<TransferServer>> {
        return this.http.all<TransferServer>(TARGET, 'list-servers', 'servers', {prefix: prefix}).pipe(
            map((servers: TransferServer[]) => {
                const sorted = [...servers].sort((left, right) => compare(left, right, sortColumn));
                if (sortDirection === 'desc') {
                    sorted.reverse();
                }
                return {
                    total: servers.length,
                    items: sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
                };
            }),
        );
    }

    /** One server, by its ID. */
    getServer(serverId: string): Observable<TransferServer> {
        return this.http.call<TransferServer>(TARGET, 'get-server', {serverId: serverId});
    }

    /**
     * Creates a transfer server in front of a bucket.
     *
     * `bucket` is a name rather than an ERN, as it is when an application is deployed: a name is what an
     * operator has in hand, and the server resolves it.
     */
    createServer(
        serverId: string,
        bucket: string,
        port: number,
        options: {protocol?: string; address?: string; homeDirectory?: string} = {},
    ): Observable<TransferServer> {
        return this.http.call<TransferServer>(TARGET, 'create-server', {
            serverId: serverId,
            bucket: bucket,
            port: port,
            protocol: options.protocol ?? PROTOCOL_SFTP,
            address: options.address ?? DEFAULT_ADDRESS,
            homeDirectory: options.homeDirectory ?? '',
            userIds: [],
            userGroups: [],
            directories: [],
            hostKey: '',
            pasvMin: DEFAULT_PASV_MIN,
            pasvMax: DEFAULT_PASV_MAX,
        });
    }

    /**
     * Changes a server, and only what is named.
     *
     * A running server picks the change up when it is next started: what is stored is the definition and
     * the manager acts on it, so changing the port of a running server does not move the listener out
     * from under a client mid-session.
     */
    updateServer(serverId: string, changes: Record<string, unknown>): Observable<TransferServer> {
        return this.http.call<TransferServer>(TARGET, 'update-server', {serverId: serverId, ...changes});
    }

    /** Asks for a server to start. The manager acts on it, so the state follows on a later read. */
    startServer(serverId: string): Observable<TransferServer> {
        return this.http.call<TransferServer>(TARGET, 'start-server', {serverId: serverId});
    }

    stopServer(serverId: string): Observable<TransferServer> {
        return this.http.call<TransferServer>(TARGET, 'stop-server', {serverId: serverId});
    }

    /** Removes a server. The bucket it served, and everything in it, is left alone. */
    deleteServer(serverId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-server', {serverId: serverId});
    }
}

/** Orders two servers by one of their fields, numerically where the field is a number. */
function compare(left: object, right: object, column: string): number {
    const a = (left as Record<string, unknown>)[column];
    const b = (right as Record<string, unknown>)[column];
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    return String(a ?? '').localeCompare(String(b ?? ''));
}

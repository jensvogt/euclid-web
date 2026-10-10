import {Component} from '@angular/core';
import type {TransferServer} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {DEFAULT_ADDRESS, EtsService, PROTOCOLS, PROTOCOL_SFTP, STATE_RUNNING} from '../service/ets.service';
import {etsServerListFeature} from './state/ets-server-list.state';

/**
 * The transfer servers: FTP and SFTP in front of a bucket.
 *
 * What a client sees when it logs in is a bucket's objects, so a server is a listener and a set of
 * rules about who may reach it rather than storage of its own. The bucket column is the one to read
 * first: two servers over the same bucket are two doors into one room.
 *
 * `state` against `desiredState` works as it does in EAP - asking a server to start records what is
 * wanted and the manager acts on it, so the two differing is an ordinary moment rather than a fault.
 */
@Component({
    selector: 'ets-server-list',
    templateUrl: './ets-server-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EtsServerListComponent extends EuclidListComponent<TransferServer> {

    override readonly feature: ListFeature<TransferServer> = etsServerListFeature;
    override readonly columns = ['serverId', 'protocol', 'listen', 'bucketName', 'state', 'created', 'actions'];

    /** What a sortable column is called on the record, where the column shows more than one field. */
    protected override readonly sortFields: Record<string, string> = {listen: 'port', bucketName: 'bucketName'};

    protected readonly dateConversion = dateConversion;
    protected readonly running = STATE_RUNNING;

    constructor(private readonly etsService: EtsService) {
        super();
    }

    /** Where the server listens, as a client would be told to connect. */
    listen(server: TransferServer): string {
        return `${server.address || DEFAULT_ADDRESS}:${server.port}`;
    }

    /** The port cannot be guessed and the bucket has to exist, which is why the dialog says so. */
    createServer(): void {
        this.addThen(
            'Create transfer server',
            [
                {name: 'serverId', label: 'Server ID', required: true},
                {name: 'protocol', label: 'Protocol', type: 'select', options: PROTOCOLS, value: PROTOCOL_SFTP},
                {
                    name: 'bucket',
                    label: 'Bucket',
                    required: true,
                    hint: 'The bucket a client sees. A name, not an ERN, and it has to exist.',
                },
                {name: 'port', label: 'Port', type: 'number', required: true},
                {
                    name: 'homeDirectory',
                    label: 'Home directory',
                    hint: 'The key prefix a session starts in. Empty is the root of the bucket.',
                },
                {
                    name: 'address',
                    label: 'Bind address',
                    value: DEFAULT_ADDRESS,
                    hint: 'What the listener binds.',
                },
            ],
            values => this.etsService.createServer(
                String(values['serverId']),
                String(values['bucket']),
                Number(values['port']),
                {
                    protocol: String(values['protocol']),
                    address: String(values['address']),
                    homeDirectory: String(values['homeDirectory']),
                },
            ),
            'Transfer server created',
            'Create',
        );
    }

    /** Asks it to start, or to stop. The manager acts on it; the state follows on a later reload. */
    toggleServer(server: TransferServer): void {
        const running = server.state === STATE_RUNNING;
        this.run(
            running
                ? this.etsService.stopServer(server.serverId)
                : this.etsService.startServer(server.serverId),
            running ? 'Asked to stop' : 'Asked to start',
        );
    }

    /**
     * Removes the server.
     *
     * The bucket it served is left alone, which is worth saying: deleting a door is not deleting the
     * room, and somebody deleting a server to clear out files would be deleting the wrong thing.
     */
    deleteServer(server: TransferServer): void {
        this.confirmThen(
            {
                title: 'Delete transfer server',
                message: server.state === STATE_RUNNING
                    ? `${server.serverId} is running on port ${server.port}. Delete it and drop the listener? The bucket ${server.bucketName} and everything in it are left alone.`
                    : `Delete ${server.serverId}? The bucket ${server.bucketName} and everything in it are left alone.`,
            },
            this.etsService.deleteServer(server.serverId),
            'Transfer server deleted',
        );
    }
}

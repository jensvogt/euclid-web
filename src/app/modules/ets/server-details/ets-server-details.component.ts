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
import {interval, Observable, Subscription} from 'rxjs';
import type {TransferServer} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {DEFAULT_ADDRESS, EtsService, PROTOCOL_FTP, STATE_RUNNING} from '../service/ets.service';
import {etsServerDetailsActions, etsServerDetailsSelectors} from './state/ets-server-details.state';

/** Which of the three lists an entry belongs to, which is also the field `update-server` takes. */
type Membership = 'userIds' | 'userGroups' | 'directories';

/**
 * One transfer server: where it listens, what it serves, and who may reach it.
 *
 * The three lists are why the page exists, and the row cannot hold them. Who may log in is two of them
 * - users by ID and the groups whose members count - and the third is the directories a client sees
 * whether or not anything is stored under them. That last one needs saying: a bucket has no
 * directories, only keys that share a prefix, so a client expecting to `cd` somewhere before uploading
 * has to be told the place exists.
 *
 * Nothing here moves data. The files a client sees are a bucket's objects, so what this page decides is
 * reachability - and a change reaches a running server when it is next started, since the stored
 * definition is what the manager acts on rather than the listener already bound.
 */
@Component({
    selector: 'ets-server-details',
    templateUrl: './ets-server-details.component.html',
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
export class EtsServerDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    server$!: Observable<TransferServer | null>;
    error$!: Observable<string | null>;

    readonly entryColumns = ['value', 'actions'];

    /** The server this page is about, by ID - which is what every ETS action takes. */
    serverId = '';

    protected readonly dateConversion = dateConversion;
    protected readonly running = STATE_RUNNING;
    protected readonly ftp = PROTOCOL_FTP;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly etsService = inject(EtsService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.serverId = this.route.snapshot.paramMap.get('serverId') ?? '';
        this.server$ = this.store.select(etsServerDetailsSelectors.selectServer);
        this.error$ = this.store.select(etsServerDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.serverId) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(etsServerDetailsActions.load({serverId: this.serverId}));
    }

    /** Where a client connects. */
    listen(server: TransferServer): string {
        return `${server.address || DEFAULT_ADDRESS}:${server.port}`;
    }

    // -- running it ----------------------------------------------------------------------------------

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
     * Moves the listener.
     *
     * A running server keeps the port it is bound to until it is next started: the definition is what
     * changes here, and the manager acts on it - which is what stops a client's session ending because
     * somebody edited a field.
     */
    setListener(server: TransferServer): void {
        this.addThen(
            'Listener for ' + server.serverId,
            [
                {name: 'address', label: 'Bind address', required: true, value: server.address || DEFAULT_ADDRESS},
                {
                    name: 'port',
                    label: 'Port',
                    type: 'number',
                    required: true,
                    value: server.port,
                    hint: 'A running server keeps its current port until it is next started.',
                },
            ],
            values => this.etsService.updateServer(server.serverId, {
                address: String(values['address']),
                port: Number(values['port']),
            }),
            'Listener changed',
            'Save',
        );
    }

    /** What the clients see: a bucket, and the prefix a session starts in. */
    setBucket(server: TransferServer): void {
        this.addThen(
            'Bucket for ' + server.serverId,
            [
                {
                    name: 'bucket',
                    label: 'Bucket',
                    required: true,
                    value: server.bucketName,
                    hint: 'A name, not an ERN, and it has to exist.',
                },
                {
                    name: 'homeDirectory',
                    label: 'Home directory',
                    value: server.homeDirectory,
                    hint: 'The key prefix a session starts in. Empty is the root of the bucket.',
                },
            ],
            values => this.etsService.updateServer(server.serverId, {
                bucket: String(values['bucket']),
                homeDirectory: String(values['homeDirectory']),
            }),
            'Bucket changed',
            'Save',
        );
    }

    /** The SFTP host key, named rather than carried: the material stays with euclid. */
    setHostKey(server: TransferServer): void {
        this.addThen(
            'Host key for ' + server.serverId,
            [{
                name: 'hostKey',
                label: 'Host key',
                value: server.hostKey,
                hint: 'The key this server presents to an SFTP client. Named, not carried - euclid keeps the material.',
            }],
            values => this.etsService.updateServer(server.serverId, {hostKey: String(values['hostKey'])}),
            'Host key changed',
            'Save',
        );
    }

    /** The passive range an FTP server hands out, which a firewall has to allow through. */
    setPassivePorts(server: TransferServer): void {
        this.addThen(
            'Passive ports for ' + server.serverId,
            [
                {name: 'pasvMin', label: 'First port', type: 'number', required: true, value: server.pasvMin},
                {
                    name: 'pasvMax',
                    label: 'Last port',
                    type: 'number',
                    required: true,
                    value: server.pasvMax,
                    hint: 'The range an FTP data connection is handed out of. A firewall has to allow all of it.',
                },
            ],
            values => this.etsService.updateServer(server.serverId, {
                pasvMin: Number(values['pasvMin']),
                pasvMax: Number(values['pasvMax']),
            }),
            'Passive ports changed',
            'Save',
        );
    }

    /**
     * Deletes the server and leaves for the list.
     *
     * The bucket it served is left alone, which is the part worth saying: deleting a door is not
     * deleting the room.
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
            () => void this.router.navigate(['/ets-server-list']),
        );
    }

    // -- who may log in, and what they see -----------------------------------------------------------

    /** One of the three lists, as rows. */
    entries(server: TransferServer, membership: Membership): string[] {
        return [...(server[membership] ?? [])].sort((left, right) => left.localeCompare(right));
    }

    /**
     * Adds one entry to one of the three lists.
     *
     * The whole list is sent because that is what `update-server` takes - a field it is given is the
     * field's new value rather than an addition to it - so the entry is appended to what is there now
     * and the result goes back. An entry already in the list is not added twice.
     */
    addEntry(server: TransferServer, membership: Membership, title: string, label: string, hint: string): void {
        this.addThen(
            title,
            [{name: 'entry', label: label, required: true, hint: hint}],
            values => {
                const entry = String(values['entry']).trim();
                const entries = server[membership] ?? [];
                return this.etsService.updateServer(server.serverId, {
                    [membership]: entries.includes(entry) ? [...entries] : [...entries, entry],
                });
            },
            'Added',
            'Add',
        );
    }

    removeEntry(server: TransferServer, membership: Membership, entry: string): void {
        this.confirmThen(
            {
                title: 'Remove',
                message: `Remove ${entry} from ${server.serverId}? A client already connected keeps its session until it ends.`,
                confirm: 'Remove',
            },
            this.etsService.updateServer(server.serverId, {
                [membership]: (server[membership] ?? []).filter(value => value !== entry),
            }),
            'Removed',
        );
    }
}

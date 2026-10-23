import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatListItem, MatNavList} from '@angular/material/list';
import {MatMenuModule} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';
import type {WorkerNode, WorkerNodeDetails} from 'euclid-ndk';

import {namespaceOf} from '../../../services/euclid-http.service';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EapService} from '../service/eap.service';
import {eapNodeDetailsActions, eapNodeDetailsSelectors} from './state/eap-node-details.state';

/**
 * One worker node: what the host is, and what is actually on it.
 *
 * The applications are why this page exists. A listing deliberately leaves them off - working them out
 * means walking every pool once per node - so "what is this machine running" is a question only
 * `get-node` answers, and it is the question somebody draining a host needs answered before they do.
 *
 * Two numbers per application, because one cannot say it: `slots` is what this node is holding for that
 * application and `running` is what is actually serving out of them. A node holding four and running
 * none is exactly the state worth seeing.
 *
 * Nothing here is configured. A node registers itself and renews a lease, so everything above the table
 * is the host reporting itself - and the page says so where the state is not simply `live`.
 */
@Component({
    selector: 'eap-node-details',
    templateUrl: './eap-node-details.component.html',
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
        MatNavList,
        MatListItem,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EapNodeDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    node$!: Observable<WorkerNodeDetails | null>;
    error$!: Observable<string | null>;

    readonly applicationColumns = ['applicationId', 'namespace', 'runtime', 'instances', 'running', 'actions'];

    /** The node this page is about, by name - which is what every node action takes. */
    name = '';

    protected readonly dateConversion = dateConversion;
    protected readonly namespaceOf = namespaceOf;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly eapService = inject(EapService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.node$ = this.store.select(eapNodeDetailsSelectors.selectNode);
        this.error$ = this.store.select(eapNodeDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.name) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(eapNodeDetailsActions.load({name: this.name}));
    }

    /** What the node is, in one word. The same three states the listing shows. */
    state(node: WorkerNode): string {
        if (!node.live) {
            return 'lost';
        }
        return node.drained ? 'draining' : 'live';
    }

    /** The host as a machine: what it runs on. */
    platform(node: WorkerNode): string {
        return [node.os, node.arch].filter(part => part).join('/') || '-';
    }

    /** What the node offers, as the manager matches it against an application's node labels. */
    labels(node: WorkerNode): string {
        const labels = Object.entries(node.labels ?? {});
        return labels.length === 0 ? '-' : labels.map(([key, value]) => `${key}=${value}`).join(', ');
    }

    /** How many instances are serving across every application on this node. */
    running(node: WorkerNodeDetails): number {
        return (node.applications ?? []).reduce((total, application) => total + application.running, 0);
    }


    // -- taking it out of service --------------------------------------------------------------------

    /**
     * Stops new instances being placed here, or puts the node back into service.
     *
     * Draining is not stopping: what the node is running keeps running and the lease keeps renewing, so
     * the host empties as its instances are replaced elsewhere rather than at a moment somebody chose.
     * The table below is what says how much is left to drift off.
     */
    toggleDrain(node: WorkerNodeDetails): void {
        if (node.drained) {
            this.run(this.eapService.drainNode(node.name, false), 'Node back in service');
            return;
        }
        this.confirmThen(
            {
                title: 'Drain node',
                message: `Stop placing new instances on ${node.name}? The ${this.running(node)} now running keep running and leave as they are replaced elsewhere, so this empties the host rather than emptying it now.`,
                confirm: 'Drain',
            },
            this.eapService.drainNode(node.name, true),
            'Node draining',
        );
    }

    /**
     * Forgets the node's registration and leaves for the list.
     *
     * Administrator only, and it stops nothing: a worker still running registers itself again on its next
     * renewal - so this is the last step of taking a host out of service, not the first. Reloading
     * afterwards is the one thing it must not do, since there is no longer a node to read.
     */
    deleteNode(node: WorkerNodeDetails): void {
        this.confirmThen(
            {
                title: 'Deregister node',
                message: node.live
                    ? `${node.name} is still renewing its lease. Deregistering does not stop it - a worker that is still running registers itself again on its next renewal. Drain it and stop the worker first.`
                    : `Forget ${node.name} and free its name for another host?`,
                confirm: 'Deregister',
            },
            this.eapService.deleteNode(node.name),
            'Node deregistered',
            () => void this.router.navigate(['/eap-node-list']),
        );
    }
}


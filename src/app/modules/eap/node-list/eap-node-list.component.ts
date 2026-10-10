import {Component} from '@angular/core';
import type {WorkerNode} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EapService} from '../service/eap.service';
import {eapNodeListFeature} from './state/eap-node-list.state';

/**
 * The worker nodes registered to this account: what each host offers, and whether it is still there.
 *
 * A node is not configured here. It registers itself and renews a lease, so this is the fleet as it has
 * reported itself - which is why the interesting column is the state. Three things it can be, and only
 * one of them is a machine doing its job:
 *
 * - *live*, and taking work.
 * - *draining*, still running what it has and still renewing, but refused new instances. A drained node
 *   empties as its instances are replaced elsewhere rather than at a moment somebody chose.
 * - *lost*, meaning the lease stopped being renewed while the registration - and everything the node was
 *   running - is still on record. That is how an absent host is told from a deregistered one, and it is
 *   the row to look at first.
 *
 * Unlike every other listing here this is not scoped by namespace: a host belongs to the account and
 * runs whatever it is given.
 */
@Component({
    selector: 'eap-node-list',
    templateUrl: './eap-node-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EapNodeListComponent extends EuclidListComponent<WorkerNode> {

    override readonly feature: ListFeature<WorkerNode> = eapNodeListFeature;
    override readonly columns = ['name', 'address', 'labels', 'platform', 'version', 'state', 'lastSeen', 'actions'];

    /** What a sortable column is called on the record, where the column shows more than one field. */
    protected override readonly sortFields: Record<string, string> = {platform: 'os', state: 'live'};

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eapService: EapService) {
        super();
    }

    /** What the node is, in one word: the state column, and what decides the colour of it. */
    state(node: WorkerNode): string {
        if (!node.live) {
            return 'lost';
        }
        return node.drained ? 'draining' : 'live';
    }

    /** The host as a machine: what it runs on, and how much of it there is. */
    platform(node: WorkerNode): string {
        const platform = [node.os, node.arch].filter(part => part).join('/') || '-';
        return node.cpuCount ? `${platform}, ${node.cpuCount} CPU` : platform;
    }

    /**
     * What the node offers, as the manager matches it.
     *
     * These are what an application's node labels are matched against when the manager decides where to
     * place an instance, so they are the reason one host gets work another does not.
     */
    labels(node: WorkerNode): string {
        const labels = Object.entries(node.labels ?? {});
        return labels.length === 0 ? '-' : labels.map(([key, value]) => `${key}=${value}`).join(', ');
    }

    /**
     * Stops new instances being placed here, or puts the node back into service.
     *
     * Draining is not stopping: what the node is running keeps running and the lease keeps renewing, so
     * the host empties as instances are replaced elsewhere. That is the whole difference, and it is worth
     * saying in the confirmation - somebody reaching for this during an incident is deciding how fast.
     */
    toggleDrain(node: WorkerNode): void {
        if (node.drained) {
            this.run(this.eapService.drainNode(node.name, false), 'Node back in service');
            return;
        }
        this.confirmThen(
            {
                title: 'Drain node',
                message: `Stop placing new instances on ${node.name}? What it is running keeps running and leaves as it is replaced elsewhere, so this empties the host rather than emptying it now.`,
                confirm: 'Drain',
            },
            this.eapService.drainNode(node.name, true),
            'Node draining',
        );
    }

    /**
     * Forgets a node's registration, which frees its name for another host.
     *
     * Stops nothing, which is the part worth saying: a worker still running registers itself again on its
     * next renewal. Taking a host out of service is draining it, stopping the worker, and then this.
     */
    deleteNode(node: WorkerNode): void {
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
        );
    }
}

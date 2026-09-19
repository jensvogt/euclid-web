import {Component} from '@angular/core';
import type {Queue} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {DEFAULT_MAX_RETRIES, DEFAULT_VISIBILITY, EqsService, STOPPED} from '../service/eqs.service';
import {eqsQueueListFeature} from './state/eqs-queue-list.state';

/** The queues in the current namespace: how deep each is, and what can be done about it. */
@Component({
    selector: 'eqs-queue-list',
    templateUrl: './eqs-queue-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EqsQueueListComponent extends EuclidListComponent<Queue> {

    override readonly feature: ListFeature<Queue> = eqsQueueListFeature;
    override readonly columns = ['name', 'available', 'invisible', 'delayed', 'size', 'status', 'created', 'actions'];

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    constructor(private readonly eqsService: EqsService) {
        super();
    }

    createQueue(): void {
        this.addThen(
            'Create queue',
            [
                {name: 'name', label: 'Name', required: true},
                {name: 'visibility', label: 'Visibility timeout (s)', type: 'number', value: DEFAULT_VISIBILITY},
                {name: 'maxRetries', label: 'Max receives before the DLQ', type: 'number', value: DEFAULT_MAX_RETRIES},
                {
                    name: 'dlqName',
                    label: 'Dead-letter queue',
                    hint: 'Leave empty for a queue with no DLQ.',
                },
                {name: 'delay', label: 'Delivery delay (s)', type: 'number', value: 0},
            ],
            values => this.eqsService.createQueue(
                String(values['name']),
                Number(values['visibility']),
                Number(values['maxRetries']),
                String(values['dlqName']),
                Number(values['delay']),
            ),
            'Queue created',
        );
    }

    sendMessage(queue: Queue): void {
        this.addThen(
            'Send a message to ' + queue.name,
            [{name: 'body', label: 'Body', required: true}],
            values => this.eqsService.sendMessage(queue.ern, String(values['body'])),
            'Message sent',
        );
    }

    purgeQueue(queue: Queue): void {
        this.confirmThen(
            {
                title: 'Purge queue',
                message: `Delete every message on ${queue.name}? ${queue.available} are available and ${queue.invisible} in flight. This cannot be undone.`,
                confirm: 'Purge',
            },
            this.eqsService.purgeQueue(queue.ern),
            'Queue purged',
        );
    }

    purgeAllQueues(): void {
        this.confirmThen(
            {
                title: 'Purge every queue',
                message: 'Delete every message on every queue of this account, in every namespace. This cannot be undone.',
                confirm: 'Purge all',
            },
            this.eqsService.purgeAllQueues(),
            'All queues purged',
        );
    }

    /** Stops the queue handing messages out, or starts it again. Messages in flight are unaffected either way. */
    toggleQueue(queue: Queue): void {
        const stopped = queue.status === STOPPED;
        this.run(
            stopped ? this.eqsService.startQueue(queue.ern) : this.eqsService.stopQueue(queue.ern),
            stopped ? 'Queue started' : 'Queue stopped',
        );
    }

    setVisibility(queue: Queue): void {
        this.addThen(
            'Visibility timeout for ' + queue.name,
            [{name: 'visibility', label: 'Seconds', type: 'number', required: true, value: queue.visibility}],
            values => this.eqsService.setQueueVisibility(queue.ern, Number(values['visibility'])),
            'Visibility timeout changed',
        );
    }

    /** Only meaningful for a dead-letter queue - it is what moves its messages back where they came from. */
    redrive(queue: Queue): void {
        this.run(this.eqsService.redriveDlq(queue.ern), 'Redrive started');
    }

    deleteQueue(queue: Queue): void {
        this.confirmThen(
            {
                title: 'Delete queue',
                message: `Delete ${queue.name} and everything on it? This cannot be undone.`,
            },
            this.eqsService.deleteQueue(queue.ern),
            'Queue deleted',
        );
    }
}

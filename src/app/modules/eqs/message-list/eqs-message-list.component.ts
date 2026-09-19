import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import type {QueueMessage} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EqsService, queueNameOf} from '../service/eqs.service';
import {eqsMessageListFeature} from './state/eqs-message-list.state';

/**
 * One queue's messages.
 *
 * Looking rather than receiving: `list-messages` leaves visibility alone, so reading a queue here does not
 * compete with whatever is consuming it.
 */
@Component({
    selector: 'eqs-message-list',
    templateUrl: './eqs-message-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EqsMessageListComponent extends EuclidListComponent<QueueMessage> {

    override readonly feature: ListFeature<QueueMessage> = eqsMessageListFeature;
    // No body column: a message body is arbitrarily large and rarely one line, so a preview of one was
    // never enough to read and always enough to crowd out the fields that tell two messages apart. The
    // copy button in the row is how the whole of it is got at.
    override readonly columns = ['messageId', 'status', 'size', 'receivedCount', 'created', 'actions'];

    /** The queue being looked into, which the template shows and every action below names. */
    queueErn = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    constructor(private readonly eqsService: EqsService) {
        super();
    }

    override ngOnInit(): void {
        // Before the base class's first load, which is what it sends as the parent.
        this.queueErn = this.route.snapshot.paramMap.get('queueErn') ?? '';
        this.parent = this.queueErn;
        super.ngOnInit();
    }

    /** The queue's name out of its ERN, for a heading that is readable. */
    get queueName(): string {
        return queueNameOf(this.queueErn);
    }

    sendMessage(): void {
        this.addThen(
            'Send a message',
            [{name: 'body', label: 'Body', required: true}],
            values => this.eqsService.sendMessage(this.queueErn, String(values['body'])),
            'Message sent',
        );
    }

    deleteMessage(message: QueueMessage): void {
        this.confirmThen(
            {title: 'Delete message', message: `Delete message ${message.messageId}? This cannot be undone.`},
            this.eqsService.deleteMessageById(message.messageId),
            'Message deleted',
        );
    }

    purgeQueue(): void {
        this.confirmThen(
            {
                title: 'Purge queue',
                message: `Delete every message on ${this.queueName}? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.eqsService.purgeQueue(this.queueErn),
            'Queue purged',
        );
    }
}

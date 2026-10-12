import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import type {TopicMessage} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EnsService} from '../service/ens.service';
import {ensMessageListFeature} from './state/ens-message-list.state';

/**
 * The messages one topic has kept.
 *
 * What is here is what the retention period left behind, not what subscribers received: every subscription
 * gets its own copy on its own queue, and those are consumed independently of this.
 */
@Component({
    selector: 'ens-message-list',
    templateUrl: './ens-message-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EnsMessageListComponent extends EuclidListComponent<TopicMessage> {

    override readonly feature: ListFeature<TopicMessage> = ensMessageListFeature;
    // No body column, as the queue message list has none: a body is arbitrarily large and rarely one line,
    // so the first line of one was never enough to read and always enough to crowd out the fields that tell
    // two messages apart. The details page is where the whole of it is, and the copy button in the row
    // yields it without going there.
    override readonly columns = ['messageId', 'status', 'contentType', 'created', 'actions'];

    /**
     * Sorted by `_id`, which is the index a topic's messages actually have.
     *
     * ENS indexes its messages on `(topicErn)` and `(topicErn, _id)` and nothing else, so asking for a
     * page ordered by `created` makes the database match the topic and then sort every match: on a topic
     * holding nine million messages that is a blocking sort of nine million documents, which does not
     * finish inside the gateway's timeout. The page never arrives - and not only here, since
     * `euclid-cli ens list-messages` defaults to the same column and times out the same way.
     *
     * `_id` costs nothing instead: an ObjectId leads with its creation second, so descending `_id` is
     * newest-published-first - the same order `created` was asking for - and the walk is the index order
     * rather than a sort. Measured against protokollierung-topic: `created` times out at 30 seconds,
     * `_id` answers in about five, which is the count of nine million documents and not the page.
     *
     * The real fix is a `(topicErn, created)` index in ENS, which is exactly what EQS already has for
     * the same reason - see MongoEqsRepository::ensureIndexes(). Until then this is the column to sort
     * on, and it is why Status and Type are not sortable here at all: they have no index either.
     */
    protected override readonly sortFields: Record<string, string> = {created: '_id'};

    topicErn = '';

    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    constructor(private readonly ensService: EnsService) {
        super();
    }

    override ngOnInit(): void {
        this.topicErn = this.route.snapshot.paramMap.get('topicErn') ?? '';
        this.parent = this.topicErn;
        super.ngOnInit();
    }

    get topicName(): string {
        return this.topicErn.substring(this.topicErn.lastIndexOf(':') + 1);
    }

    publishMessage(): void {
        this.addThen(
            'Publish a message',
            [{name: 'body', label: 'Body', required: true}],
            values => this.ensService.publishMessage(this.topicErn, String(values['body'])),
            'Message published',
        );
    }

    purgeTopic(): void {
        this.confirmThen(
            {
                title: 'Purge topic',
                message: `Delete every message ${this.topicName} is holding? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.ensService.purgeTopic(this.topicErn),
            'Topic purged',
        );
    }
}

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

import {Component} from '@angular/core';
import type {Topic} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EnsService, INSTALLATION_RETENTION, RETENTION_FOREVER, retentionLabel, STOPPED} from '../service/ens.service';
import {ensTopicListFeature} from './state/ens-topic-list.state';

/** The topics in the current namespace: what they hold, and whether they are delivering. */
@Component({
    selector: 'ens-topic-list',
    templateUrl: './ens-topic-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EnsTopicListComponent extends EuclidListComponent<Topic> {

    override readonly feature: ListFeature<Topic> = ensTopicListFeature;
    override readonly columns = ['name', 'messages', 'size', 'status', 'retentionPeriod', 'created', 'actions'];

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    constructor(private readonly ensService: EnsService) {
        super();
    }

    createTopic(): void {
        this.addThen(
            'Create topic',
            [{name: 'name', label: 'Name', required: true}],
            values => this.ensService.createTopic(String(values['name'])),
            'Topic created',
        );
    }

    publishMessage(topic: Topic): void {
        this.addThen(
            'Publish to ' + topic.name,
            [{name: 'body', label: 'Body', required: true}],
            values => this.ensService.publishMessage(topic.ern, String(values['body'])),
            'Message published',
        );
    }

    /** Stops delivery, or starts it and releases whatever was held in the meantime. */
    toggleTopic(topic: Topic): void {
        const stopped = topic.status === STOPPED;
        this.run(
            stopped ? this.ensService.startTopic(topic.ern) : this.ensService.stopTopic(topic.ern),
            stopped ? 'Topic started, held messages released' : 'Topic stopped, messages will be held',
        );
    }

    /** How long published messages are kept. The two special values are worth spelling out in the hint. */
    setRetention(topic: Topic): void {
        this.addThen(
            'Retention for ' + topic.name,
            [{
                name: 'retentionPeriod',
                label: 'Retention (s)',
                type: 'number',
                required: true,
                value: topic.retentionPeriod,
                hint: `${INSTALLATION_RETENTION} follows the installation's setting, ${RETENTION_FOREVER} keeps messages indefinitely.`,
            }],
            values => this.ensService.setTopicRetention(topic.ern, Number(values['retentionPeriod'])),
            'Retention changed',
        );
    }

    purgeTopic(topic: Topic): void {
        this.confirmThen(
            {
                title: 'Purge topic',
                message: `Delete the ${topic.messages} messages ${topic.name} is holding? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.ensService.purgeTopic(topic.ern),
            'Topic purged',
        );
    }

    /** Scoped to the session's namespace, which is ENS's own default - unlike EQS, which spans the account. */
    purgeAllTopics(): void {
        this.confirmThen(
            {
                title: 'Purge every topic',
                message: 'Delete the held messages of every topic in this namespace. This cannot be undone.',
                confirm: 'Purge all',
            },
            this.ensService.purgeAllTopics(),
            'All topics purged',
        );
    }

    deleteTopic(topic: Topic): void {
        this.confirmThen(
            {
                title: 'Delete topic',
                message: `Delete ${topic.name} and its subscriptions? This cannot be undone.`,
            },
            this.ensService.deleteTopic(topic.ern),
            'Topic deleted',
        );
    }

    protected readonly retention = retentionLabel;
}

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
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription as RxSubscription} from 'rxjs';
import type {Subscription, Topic} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag, ResourceTagsComponent} from '../../../shared/tags/resource-tags.component';
import {
    EnsService,
    INSTALLATION_RETENTION,
    QUEUE,
    RETENTION_FOREVER,
    retentionLabel,
    STOPPED,
    TOPIC,
    topicNameOf,
} from '../service/ens.service';
import {ensTopicDetailsActions, ensTopicDetailsSelectors} from './state/ens-topic-details.state';

/**
 * One topic: what it holds, what it is set to, and who is listening.
 *
 * The list has room for how much a topic holds and no more, so what it leaves out - the owner, the
 * length limit, its tags, and above all its subscriptions - is here, next to the actions that change
 * them. The subscriptions are the reason this page is worth more than the row it came from: a topic is
 * an instruction to deliver onward, and nothing else in this UI says where.
 */
@Component({
    selector: 'ens-topic-details',
    templateUrl: './ens-topic-details.component.html',
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
        ResourceTagsComponent,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EnsTopicDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    topic$!: Observable<Topic | null>;
    subscriptions$!: Observable<Subscription[]>;
    error$!: Observable<string | null>;

    readonly subscriptionColumns = ['target', 'type', 'created', 'actions'];

    /** The topic this page is about. Nothing here renames a topic, so this does not change. */
    ern = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;
    protected readonly stopped = STOPPED;
    protected readonly retention = retentionLabel;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly ensService = inject(EnsService);

    private updateSubscription: RxSubscription | undefined;

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get topicName(): string {
        return topicNameOf(this.ern);
    }

    ngOnInit(): void {
        this.ern = this.route.snapshot.paramMap.get('topicErn') ?? '';
        this.topic$ = this.store.select(ensTopicDetailsSelectors.selectTopic);
        this.subscriptions$ = this.store.select(ensTopicDetailsSelectors.selectSubscriptions);
        this.error$ = this.store.select(ensTopicDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.ern) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(ensTopicDetailsActions.load({ern: this.ern}));
    }

    /** What a subscription delivers to, in the words the page uses rather than the wire's. */
    targetKind(subscription: Subscription): string {
        switch (subscription.type) {
            case QUEUE:
                return 'queue';
            case TOPIC:
                return 'topic';
            default:
                return subscription.type || '-';
        }
    }

    // -- the topic itself ----------------------------------------------------------------------------

    /** Stops delivery, or starts it and releases whatever was held in the meantime. */
    toggleTopic(topic: Topic): void {
        const stopped = topic.status === STOPPED;
        this.run(
            stopped ? this.ensService.startTopic(topic.ern) : this.ensService.stopTopic(topic.ern),
            stopped ? 'Topic started, held messages released' : 'Topic stopped, messages will be held',
        );
    }

    publishMessage(topic: Topic): void {
        this.addThen(
            'Publish to ' + topic.name,
            [{name: 'body', label: 'Body', required: true}],
            values => this.ensService.publishMessage(topic.ern, String(values['body'])),
            'Message published',
            'Publish',
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
            'Save',
        );
    }

    setMaxMessageLength(topic: Topic): void {
        this.addThen(
            'Maximum message length for ' + topic.name,
            [{
                name: 'maxMessageLength',
                label: 'Bytes',
                type: 'number',
                required: true,
                value: topic.maxMessageLength,
                hint: 'Has to be a positive number of bytes.',
            }],
            values => this.ensService.setTopicMaxMessageLength(topic.ern, Number(values['maxMessageLength'])),
            'Maximum message length changed',
            'Save',
        );
    }

    /**
     * Fans everything the topic still holds out again.
     *
     * Behind a confirmation because it is not a repair: a subscriber that received a message the first
     * time receives it a second time, which is what makes this useful for a subscription added after the
     * fact and disruptive for one that was there all along.
     */
    resendMessages(topic: Topic): void {
        this.confirmThen(
            {
                title: 'Resend messages',
                message: `Deliver the ${topic.messages} messages ${topic.name} holds to every subscriber again? Subscribers that already received them receive them a second time.`,
                confirm: 'Resend',
            },
            this.ensService.resendMessages(topic.ern),
            'Resend started',
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

    /**
     * Deletes the topic and leaves for the list.
     *
     * Reloading afterwards is what every other action here does and the one thing this one must not do:
     * the topic this page is about is gone, so reading it back would answer with an error rather than a
     * refresh.
     */
    deleteTopic(topic: Topic): void {
        this.confirmThen(
            {
                title: 'Delete topic',
                message: `Delete ${topic.name} and its subscriptions? This cannot be undone.`,
            },
            this.ensService.deleteTopic(topic.ern),
            'Topic deleted',
            () => void this.router.navigate(['/ens-topic-list']),
        );
    }

    // -- subscriptions -------------------------------------------------------------------------------

    /**
     * Sends what arrives at this topic onward to a queue or another topic.
     *
     * The target is an ERN rather than a name: a subscription can point at another namespace, and a name
     * would be resolved in this one. Subscribing twice to the same target is not refused - it means that
     * target receives everything twice - which is what the table above the button is for.
     */
    subscribe(topic: Topic): void {
        this.addThen(
            'Subscribe to ' + topic.name,
            [
                {name: 'targetErn', label: 'Target ERN', required: true, hint: 'The queue or topic to deliver to.'},
                {name: 'type', label: 'Target is a', type: 'select', options: ['queue', 'topic'], value: 'queue'},
            ],
            values => this.ensService.subscribe(
                topic.ern,
                String(values['targetErn']),
                String(values['type']) === 'topic' ? TOPIC : QUEUE,
            ),
            'Subscribed',
            'Subscribe',
        );
    }

    unsubscribe(topic: Topic, subscription: Subscription): void {
        this.confirmThen(
            {
                title: 'Unsubscribe',
                message: `Stop delivering ${topic.name} to ${subscription.targetErn}? What has already been delivered stays where it is.`,
                confirm: 'Unsubscribe',
            },
            this.ensService.unsubscribe(subscription.ern),
            'Unsubscribed',
        );
    }

    // -- tags ----------------------------------------------------------------------------------------

    /**
     * Adds a tag.
     *
     * `add-topic-tag` rather than `set-topic-tag`: adding is what this is, and a key the topic already
     * carries keeps the value it has rather than quietly losing it to whatever was typed here.
     * {@link editTag} is how a value is meant to change.
     */
    addTag(topic: Topic): void {
        this.addThen(
            'Add a tag to ' + topic.name,
            [
                {name: 'key', label: 'Key', required: true},
                {name: 'value', label: 'Value'},
            ],
            values => this.ensService.addTopicTag(topic.ern, String(values['key']), String(values['value'])),
            'Tag added',
            'Add',
        );
    }

    /** Only the value is asked for: changing the key would leave the old tag behind rather than rename it. */
    editTag(topic: Topic, tag: ResourceTag): void {
        this.addThen(
            'Edit ' + tag.key,
            [{name: 'value', label: 'Value', value: tag.value, hint: 'Currently ' + (tag.value || 'empty')}],
            values => this.ensService.setTopicTag(topic.ern, tag.key, String(values['value'])),
            'Tag changed',
            'Save',
        );
    }

    deleteTag(topic: Topic, tag: ResourceTag): void {
        this.confirmThen(
            {title: 'Delete tag', message: `Remove the tag ${tag.key} from ${topic.name}?`},
            this.ensService.deleteTopicTag(topic.ern, tag.key),
            'Tag deleted',
        );
    }
}

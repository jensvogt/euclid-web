import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';
import type {Queue} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag, ResourceTagsComponent} from '../../../shared/tags/resource-tags.component';
import {EqsService, MAX_QUEUE_DELAY, queueNameOf, STOPPED} from '../service/eqs.service';
import {eqsQueueDetailsActions, eqsQueueDetailsSelectors} from './state/eqs-queue-details.state';

/**
 * One queue: what is on it, what it is set to, and everything that can be changed about it.
 *
 * The list has room for how deep a queue is and no more, so what it leaves out - the owner, the dead
 * letter queue, the delay and the length limit, its tags - is here, next to the actions that change them.
 * The queue menu in the list stays as it is: it is the right place to do one thing to one of forty rows,
 * and this is the right place to look at one queue and work on it.
 */
@Component({
    selector: 'eqs-queue-details',
    templateUrl: './eqs-queue-details.component.html',
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
        ResourceTagsComponent,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EqsQueueDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    queue$!: Observable<Queue | null>;
    error$!: Observable<string | null>;

    /** The queue this page is about. Nothing here renames a queue, so this does not change. */
    ern = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;
    protected readonly stopped = STOPPED;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly eqsService = inject(EqsService);

    private updateSubscription: Subscription | undefined;

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get queueName(): string {
        return queueNameOf(this.ern);
    }

    ngOnInit(): void {
        this.ern = this.route.snapshot.paramMap.get('queueErn') ?? '';
        this.queue$ = this.store.select(eqsQueueDetailsSelectors.selectQueue);
        this.error$ = this.store.select(eqsQueueDetailsSelectors.selectError);
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
        this.store.dispatch(eqsQueueDetailsActions.load({ern: this.ern}));
    }

    // -- the queue itself ----------------------------------------------------------------------------

    /** Stops the queue handing messages out, or starts it again. Messages in flight are unaffected either way. */
    toggleQueue(queue: Queue): void {
        const stopped = queue.status === STOPPED;
        this.run(
            stopped ? this.eqsService.startQueue(queue.ern) : this.eqsService.stopQueue(queue.ern),
            stopped ? 'Queue started' : 'Queue stopped',
        );
    }

    sendMessage(queue: Queue): void {
        this.addThen(
            'Send a message to ' + queue.name,
            [{name: 'body', label: 'Body', required: true}],
            values => this.eqsService.sendMessage(queue.ern, String(values['body'])),
            'Message sent',
            'Send',
        );
    }

    /** How long a received message stays invisible to everyone else before it comes back. */
    setVisibility(queue: Queue): void {
        this.addThen(
            'Visibility timeout for ' + queue.name,
            [{
                name: 'visibility',
                label: 'Seconds',
                type: 'number',
                required: true,
                value: queue.visibility,
                hint: 'How long a received message is hidden from other consumers.',
            }],
            values => this.eqsService.setQueueVisibility(queue.ern, Number(values['visibility'])),
            'Visibility timeout changed',
            'Save',
        );
    }

    /** What is sent from here on, and nothing else: a message already waiting keeps the delay it arrived with. */
    setDelay(queue: Queue): void {
        this.addThen(
            'Delivery delay for ' + queue.name,
            [{
                name: 'delay',
                label: 'Seconds',
                type: 'number',
                required: true,
                value: queue.delay,
                hint: `0 to ${MAX_QUEUE_DELAY}. Applies to messages sent from now on, not to those already waiting.`,
            }],
            values => this.eqsService.setQueueDelay(queue.ern, Number(values['delay'])),
            'Delivery delay changed',
            'Save',
        );
    }

    setMaxMessageLength(queue: Queue): void {
        this.addThen(
            'Maximum message length for ' + queue.name,
            [{
                name: 'maxMessageLength',
                label: 'Bytes',
                type: 'number',
                required: true,
                value: queue.maxMessageLength,
                hint: 'Zero follows the installation default.',
            }],
            values => this.eqsService.setQueueMaxMessageLength(queue.ern, Number(values['maxMessageLength'])),
            'Maximum message length changed',
            'Save',
        );
    }

    /**
     * Moves a dead-letter queue's messages back where they came from.
     *
     * Only meaningful for a queue that is one. What it cannot place - several queues can share a dead
     * letter queue, and a message that predates the recording of its origin has nowhere to be sent back
     * to - is left alone rather than guessed at.
     */
    redrive(queue: Queue): void {
        this.confirmThen(
            {
                title: 'Redrive',
                message: `Move the ${queue.available} available messages on ${queue.name} back to the queues they came from? Messages with no recorded origin stay here.`,
                confirm: 'Redrive',
            },
            this.eqsService.redriveDlq(queue.ern),
            'Redrive started',
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

    /**
     * Deletes the queue and leaves for the list.
     *
     * Reloading afterwards is what every other action here does and the one thing this one must not do:
     * the queue this page is about is gone, so reading it back would answer with an error rather than a
     * refresh.
     */
    deleteQueue(queue: Queue): void {
        this.confirmThen(
            {
                title: 'Delete queue',
                message: `Delete ${queue.name} and everything on it? This cannot be undone.`,
            },
            this.eqsService.deleteQueue(queue.ern),
            'Queue deleted',
            () => void this.router.navigate(['/eqs-queue-list']),
        );
    }

    // -- tags ----------------------------------------------------------------------------------------

    /**
     * Adds a tag.
     *
     * `add-queue-tag` rather than `set-queue-tag`: adding is what this is, and a key the queue already
     * carries keeps the value it has rather than quietly losing it to whatever was typed here.
     * {@link editTag} is how a value is meant to change.
     */
    addTag(queue: Queue): void {
        this.addThen(
            'Add a tag to ' + queue.name,
            [
                {name: 'key', label: 'Key', required: true},
                {name: 'value', label: 'Value'},
            ],
            values => this.eqsService.addQueueTag(queue.ern, String(values['key']), String(values['value'])),
            'Tag added',
            'Add',
        );
    }

    /** Only the value is asked for: changing the key would leave the old tag behind rather than rename it. */
    editTag(queue: Queue, tag: ResourceTag): void {
        this.addThen(
            'Edit ' + tag.key,
            [{name: 'value', label: 'Value', value: tag.value, hint: 'Currently ' + (tag.value || 'empty')}],
            values => this.eqsService.setQueueTag(queue.ern, tag.key, String(values['value'])),
            'Tag changed',
            'Save',
        );
    }

    deleteTag(queue: Queue, tag: ResourceTag): void {
        this.confirmThen(
            {title: 'Delete tag', message: `Remove the tag ${tag.key} from ${queue.name}?`},
            this.eqsService.deleteQueueTag(queue.ern, tag.key),
            'Tag deleted',
        );
    }
}

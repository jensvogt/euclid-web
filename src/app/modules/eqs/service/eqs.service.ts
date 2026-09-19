import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Queue, QueueMessage} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, PageQuery, pagePayload, Page} from '../../../services/euclid-http.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';

export const TARGET = 'eqs';

/** euclid's own defaults for a new queue, so the dialog offers what the server would have chosen. */
export const DEFAULT_VISIBILITY = 30;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_MAX_MESSAGE_LENGTH = 1024 * 1024;

/** The longest a queue may hold a sent message back, as the server enforces it. */
export const MAX_QUEUE_DELAY = 900;

/** What {@link Queue.status} reads while a queue is handing nothing out. */
export const STOPPED = 'STOPPED';

/** `purge-all-queues` reads this as "every namespace of the account". */
export const EVERY_NAMESPACE = '';

/** EQS - euclid's queue module: queues and the messages on them. */
@Injectable({providedIn: 'root'})
export class EqsService {

    constructor(private readonly http: EuclidHttpService, private readonly session: EuclidSessionService) {
    }

    listQueues(query: ListQuery, includeInternal = false): Observable<Page<Queue>> {
        const payload = {...listPayload(query, 'name'), includeInternal: includeInternal};
        return this.http.page<Queue>(TARGET, 'list-queues', 'queues', payload);
    }

    /**
     * One queue, by ERN.
     *
     * What comes back is what a listing describes each of its own with, so this is the single-queue form
     * of a listing rather than another view of one. By ERN rather than by name, which `get-queue` also
     * takes: a details page was reached from a listing that already said which queue it meant, and a name
     * would be resolved again in the session's own namespace.
     */
    getQueue(ern: string): Observable<Queue> {
        return this.http.call<Record<string, unknown>>(TARGET, 'get-queue', {ern: ern}).pipe(
            map((response: Record<string, unknown>) => response['queue'] as Queue),
        );
    }

    createQueue(name: string, visibility = DEFAULT_VISIBILITY, maxRetries = DEFAULT_MAX_RETRIES, dlqName = '', delay = 0): Observable<unknown> {
        return this.http.call(TARGET, 'create-queue', {
            name: name,
            visibility: visibility,
            maxRetries: maxRetries,
            maxMessageLength: DEFAULT_MAX_MESSAGE_LENGTH,
            dlqName: dlqName,
            delay: delay,
            priority: '',
            internal: false,
        });
    }

    /** Deletes a queue and everything on it. */
    deleteQueue(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-queue', {ern: ern});
    }

    getQueueMetadata(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'get-queue-metadata', {ern: ern});
    }

    purgeQueue(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'purge-queue', {ern: ern});
    }

    /**
     * Empties every queue of the account.
     *
     * Every namespace of that account rather than only the session's - which is the default euclid has had
     * since this action existed, and narrowing it here would quietly spare queues the user meant to empty.
     * Note the server spells this field `nameSpace`.
     */
    purgeAllQueues(): Observable<unknown> {
        const session = this.session.session;
        return this.http.call(TARGET, 'purge-all-queues', {
            region: session?.region ?? '',
            accountId: session?.accountId ?? '',
            nameSpace: EVERY_NAMESPACE,
        });
    }

    /** Stops a queue handing messages out. Messages already in flight are left alone. */
    stopQueue(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'stop-queue', {ern: ern});
    }

    startQueue(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'start-queue', {ern: ern});
    }

    setQueueVisibility(ern: string, visibility: number): Observable<unknown> {
        return this.http.call(TARGET, 'set-queue-visibility', {ern: ern, visibility: visibility});
    }

    /**
     * Changes how long a queue holds a sent message back before it can be received.
     *
     * What is sent from here on, and nothing else: a message already waiting had its delay applied when
     * it arrived, so changing this does not move it.
     */
    setQueueDelay(ern: string, delay: number): Observable<unknown> {
        return this.http.call(TARGET, 'set-queue-delay', {ern: ern, delay: delay});
    }

    /** The largest message the queue accepts. Zero follows the installation's own default. */
    setQueueMaxMessageLength(ern: string, maxMessageLength: number): Observable<unknown> {
        return this.http.call(TARGET, 'set-queue-max-message-length', {
            ern: ern,
            maxMessageLength: maxMessageLength,
        });
    }

    /** Tags a queue. A key that is already tagged keeps its value - {@link setQueueTag} overwrites. */
    addQueueTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'add-queue-tag', {ern: ern, key: key, value: value});
    }

    /** Sets the value of a tag the queue already has - which is what editing one is. */
    setQueueTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'set-queue-tag', {ern: ern, key: key, value: value});
    }

    deleteQueueTag(ern: string, key: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-queue-tag', {ern: ern, key: key});
    }

    /** Moves a dead-letter queue's messages back where they came from. Only meaningful for a DLQ. */
    redriveDlq(ern: string, targetErn = ''): Observable<unknown> {
        return this.http.call(TARGET, 'redrive-dlq', {ern: ern, targetErn: targetErn});
    }

    // -- messages ------------------------------------------------------------------------------

    /**
     * One page of the messages on a queue.
     *
     * Looking, not receiving: `list-messages` leaves visibility alone, so a consumer is not competed with by
     * somebody reading the queue in a browser.
     */
    listMessages(queueErn: string, query: PageQuery): Observable<Page<QueueMessage>> {
        const payload = {queueErn: queueErn, ...pagePayload(query, 'created')};
        return this.http.page<QueueMessage>(TARGET, 'list-messages', 'messages', payload);
    }

    sendMessage(queueErn: string, body: string): Observable<unknown> {
        return this.http.call(TARGET, 'send-message', {ern: queueErn, body: body, attributes: {}});
    }

    deleteMessageById(messageId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-message', {messageId: messageId});
    }

    getMessageCount(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'get-message-count', {ern: ern});
    }
}

/**
 * The queue's name out of its ERN, which is the last segment of one.
 *
 * A view that was handed an ERN by a route has no queue to read the name off until the server answers,
 * and a heading that says nothing until then is worse than one taken from the address.
 */
export function queueNameOf(ern: string): string {
    return ern.substring(ern.lastIndexOf(':') + 1);
}

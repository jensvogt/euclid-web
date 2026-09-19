import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Subscription, Topic, TopicMessage} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, PageQuery, pagePayload, Page} from '../../../services/euclid-http.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';

export const TARGET = 'ens';

export const DEFAULT_MAX_MESSAGE_LENGTH = 1024 * 1024;

/** What a subscription delivers to, and what {@link EnsService.subscribe} names the two kinds by. */
export const QUEUE = 'SQS';
export const TOPIC = 'SNS';

/** What {@link Topic.status} reads while a topic is holding rather than fanning out. */
export const STOPPED = 'STOPPED';

/** What the installation's own retention setting means when a topic asks for no particular one. */
export const INSTALLATION_RETENTION = 0;
/** Keep messages indefinitely. */
export const RETENTION_FOREVER = -1;

/** ENS - euclid's notification module: topics, the messages published to them, and subscriptions. */
@Injectable({providedIn: 'root'})
export class EnsService {

    constructor(private readonly http: EuclidHttpService, private readonly session: EuclidSessionService) {
    }

    listTopics(query: ListQuery): Observable<Page<Topic>> {
        return this.http.page<Topic>(TARGET, 'list-topics', 'topics', listPayload(query, 'name'));
    }

    /**
     * One topic, by ERN.
     *
     * What comes back is what a listing describes each of its own with, so this is the single-topic form
     * of a listing rather than another view of one. By ERN rather than by name, which `get-topic` also
     * takes: a details page was reached from a listing that already said which topic it meant, and a name
     * would be resolved again in the session's own namespace.
     */
    getTopic(ern: string): Observable<Topic> {
        return this.http.call<Record<string, unknown>>(TARGET, 'get-topic', {ern: ern}).pipe(
            map((response: Record<string, unknown>) => response['topic'] as Topic),
        );
    }

    createTopic(name: string, maxMessageLength = DEFAULT_MAX_MESSAGE_LENGTH): Observable<unknown> {
        return this.http.call(TARGET, 'create-topic', {name: name, maxMessageLength: maxMessageLength});
    }

    deleteTopic(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-topic', {ern: ern});
    }

    getTopicMetadata(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'get-topic-metadata', {ern: ern});
    }

    /** Stops a topic delivering. Messages published while it is stopped are held, not lost. */
    stopTopic(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'stop-topic', {ern: ern});
    }

    /** Starts a topic, and releases whatever was held while it was stopped. */
    startTopic(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'start-topic', {ern: ern});
    }

    setTopicRetention(ern: string, retentionPeriod: number): Observable<unknown> {
        return this.http.call(TARGET, 'set-topic-retention', {ern: ern, retentionPeriod: retentionPeriod});
    }

    /** The largest message the topic accepts, in bytes. The server refuses zero and below. */
    setTopicMaxMessageLength(ern: string, maxMessageLength: number): Observable<unknown> {
        return this.http.call(TARGET, 'set-topic-max-message-length', {
            ern: ern,
            maxMessageLength: maxMessageLength,
        });
    }

    /**
     * Fans messages out again, to every subscriber the topic has now.
     *
     * Not a repair of a failed delivery: a subscriber that received one the first time receives it again,
     * so this is for a subscription that was added or fixed after the fact. `background` has the server
     * answer as soon as it has taken the work on, which a topic of any size wants.
     */
    resendMessages(ern: string, messageId = '', background = true): Observable<unknown> {
        return this.http.call(TARGET, 'resend-messages', {ern: ern, messageId: messageId, async: background});
    }

    /** Tags a topic. A key that is already tagged keeps its value - {@link setTopicTag} overwrites. */
    addTopicTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'add-topic-tag', {ern: ern, key: key, value: value});
    }

    /** Sets the value of a tag the topic already has - which is what editing one is. */
    setTopicTag(ern: string, key: string, value: string): Observable<unknown> {
        return this.http.call(TARGET, 'set-topic-tag', {ern: ern, key: key, value: value});
    }

    deleteTopicTag(ern: string, key: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-topic-tag', {ern: ern, key: key});
    }

    purgeTopic(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'purge-topic', {ern: ern});
    }

    /**
     * Empties every topic in scope.
     *
     * Narrowed to the session's namespace, which is the default ENS has - unlike EQS's `purge-all-queues`,
     * which spans the account. The two differ because each kept the default it shipped with, so this follows
     * the server rather than making them agree here.
     */
    purgeAllTopics(): Observable<unknown> {
        const session = this.session.session;
        return this.http.call(TARGET, 'purge-all-topics', {
            region: session?.region ?? '',
            accountId: session?.accountId ?? '',
            nameSpace: session?.namespace ?? '',
        });
    }

    // -- messages ------------------------------------------------------------------------------

    listMessages(topicErn: string, query: PageQuery): Observable<Page<TopicMessage>> {
        const payload = {topicErn: topicErn, ...pagePayload(query, 'created')};
        return this.http.page<TopicMessage>(TARGET, 'list-messages', 'messages', payload);
    }

    publishMessage(topicErn: string, body: string): Observable<unknown> {
        return this.http.call(TARGET, 'publish-message', {ern: topicErn, body: body, attributes: {}});
    }

    getMessageCount(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'get-message-count', {ern: ern});
    }

    /** Every subscription on a topic. An array rather than a page - a topic has a handful. */
    listSubscriptions(topicErn: string): Observable<Subscription[]> {
        return this.http.all<Subscription>(TARGET, 'list-subscriptions', 'subscriptions', {topicErn: topicErn});
    }

    /**
     * Delivers what arrives at this topic onward to a queue or another topic, from now on.
     *
     * Not idempotent: a second subscription to the same target means that target receives every message
     * twice, so what is already there is worth looking at first - which is what the details page shows.
     */
    subscribe(topicErn: string, targetErn: string, targetType = QUEUE): Observable<unknown> {
        return this.http.call(TARGET, 'subscribe', {
            sourceErn: topicErn,
            type: targetType,
            targetErn: targetErn,
        });
    }

    /** Removes a subscription, by the subscription's own ERN - not the topic's, and not the target's. */
    unsubscribe(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'unsubscribe', {ern: ern});
    }
}

/**
 * The topic's name out of its ERN, which is the last segment of one.
 *
 * A view that was handed an ERN by a route has no topic to read the name off until the server answers,
 * and a heading that says nothing until then is worse than one taken from the address.
 */
export function topicNameOf(ern: string): string {
    return ern.substring(ern.lastIndexOf(':') + 1);
}

/** The retention period as something readable, since 0 and -1 both mean something other than a duration. */
export function retentionLabel(seconds: number): string {
    if (seconds === RETENTION_FOREVER) {
        return 'forever';
    }
    if (seconds === INSTALLATION_RETENTION) {
        return 'installation default';
    }
    return seconds + 's';
}

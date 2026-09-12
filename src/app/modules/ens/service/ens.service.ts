import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import type {Topic, TopicMessage} from 'euclid-ndk';

import {EuclidHttpService, ListQuery, listPayload, PageQuery, pagePayload, Page} from '../../../services/euclid-http.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';

export const TARGET = 'ens';

export const DEFAULT_MAX_MESSAGE_LENGTH = 1024 * 1024;

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
    listSubscriptions(topicErn: string): Observable<unknown[]> {
        return this.http.all<unknown>(TARGET, 'list-subscriptions', 'subscriptions', {topicErn: topicErn});
    }

    unsubscribe(ern: string): Observable<unknown> {
        return this.http.call(TARGET, 'unsubscribe', {ern: ern});
    }
}

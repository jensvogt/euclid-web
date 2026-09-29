import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIcon} from '@angular/material/icon';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, map, Observable, Subscription} from 'rxjs';
import type {TopicMessage, Variant} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {prettyPrint} from '../../../shared/text-utils.component';
import {EnsService, topicNameOf} from '../service/ens.service';
import {ensMessageDetailsActions, ensMessageDetailsSelectors} from './state/ens-message-details.state';

/** One attribute, as the table shows it: euclid keys them by name, and a table wants rows. */
export interface MessageAttributeRow {
    name: string;
    type: string;
    value: string;
}

/**
 * One message a topic has kept: everything it carries, and the body itself.
 *
 * The message list shows the first line of a body and no more, which is enough to recognise a message and
 * never enough to read one. This is where the whole of it is, next to the attributes it was published with.
 *
 * **What is here is the topic's own copy.** Every subscription gets a copy of its own on its own queue, and
 * those are consumed independently - so reading a message here delivers nothing, and the `status` on it is
 * the topic's account of the fan-out rather than any one subscriber's. The same goes for saving an edited
 * body: it corrects what the topic holds, and {@link resend} is what carries the correction to subscribers.
 *
 * Narrower than the queue message page in two ways, because {@link TopicMessage} is: a published message has
 * no system attributes - euclid's envelope is a queue message's - and no size, priority, receipt handle or
 * delivery count, since nothing leases it.
 */
@Component({
    selector: 'ens-message-details',
    templateUrl: './ens-message-details.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardContent,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatTableModule,
        MatTabsModule,
        CdkCopyToClipboard,
        FormsModule,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EnsMessageDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    message$!: Observable<TopicMessage | null>;
    attributes$!: Observable<MessageAttributeRow[]>;
    error$!: Observable<string | null>;

    readonly attributeColumns = ['name', 'value', 'type'];

    /** Which message this page is about, and the topic it was published to. */
    topicErn = '';
    messageId = '';

    /** The body as the box has it, which is what a save takes and what the user has been typing into. */
    body = '';

    /** The body as the server last said it is: what {@link bodyEdited} compares against and revert goes back to. */
    serverBody = '';

    /**
     * What was in the box before it was laid out, or null when what is in the box is not a laid-out
     * version of anything.
     *
     * Both the toggle's state and what it toggles back to. Null-as-off rather than a second flag beside
     * it, because the two cannot then disagree: there is no way to be "formatted" with nothing to go back
     * to, which is the state that would lose somebody's body.
     */
    private unformatted: string | null = null;

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly ensService = inject(EnsService);

    private readonly subscriptions = new Subscription();

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get topicName(): string {
        return topicNameOf(this.topicErn);
    }

    /** Whether the box has been typed into since the last answer from the server. */
    get bodyEdited(): boolean {
        return this.body !== this.serverBody;
    }

    /** Whether the box is showing a laid-out version of something, which is what the toggle undoes. */
    get prettyPrinted(): boolean {
        return this.unformatted !== null;
    }

    ngOnInit(): void {
        this.topicErn = this.route.snapshot.paramMap.get('topicErn') ?? '';
        this.messageId = this.route.snapshot.paramMap.get('messageId') ?? '';
        this.message$ = this.store.select(ensMessageDetailsSelectors.selectMessage);
        this.attributes$ = this.message$.pipe(map(message => attributeRows(message?.attributes)));
        this.error$ = this.store.select(ensMessageDetailsSelectors.selectError);

        this.subscriptions.add(this.message$.subscribe(message => this.takeBody(message)));
        this.load();
        this.subscriptions.add(interval(autoReloadPeriod()).subscribe(() => this.load()));
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    override load(): void {
        if (!this.messageId) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(ensMessageDetailsActions.load({messageId: this.messageId}));
    }

    // -- the body ------------------------------------------------------------------------------------

    /** Throws the edit away and goes back to what the server last said the body is. */
    revertBody(): void {
        this.body = this.serverBody;
        this.unformatted = null;
    }

    /**
     * Lays the body out when it is JSON or XML, and puts it back as it was when pressed again.
     *
     * An edit like any other while it is on: the box holds something the message does not, so the page
     * says so and the save button lights up. Which is the honest reading - indentation is bytes, and a
     * formatted body saved back is a different message from the one that was published.
     *
     * A body that is neither says so rather than leaving a button that appears to have done nothing.
     */
    togglePrettyPrint(): void {
        if (this.unformatted !== null) {
            this.body = this.unformatted;
            this.unformatted = null;
            return;
        }
        const pretty = prettyPrint(this.body);
        if (pretty === null) {
            this.snackBar.open('Not JSON or XML, so the body is left as it is.', 'OK', {duration: 5000});
            return;
        }
        this.unformatted = this.body;
        this.body = pretty;
    }

    /**
     * Typing makes the remembered original stale, so the toggle stops claiming to hold one.
     *
     * Only the user's typing reaches this: `ngModelChange` fires for a change made in the view, and every
     * assignment this class makes to {@link body} goes the other way. Without it, laying a body out,
     * correcting a line and pressing the toggle again would restore the version from before the
     * correction - an undo nobody asked for, of something they did not undo.
     */
    bodyChanged(): void {
        this.unformatted = null;
    }

    /**
     * Writes the edited body back to this message.
     *
     * The copy the topic holds, and only that: a subscriber that already received the message has its own
     * copy on its own queue, which this does not reach. {@link resend} is what sends the corrected body on.
     */
    saveBody(): void {
        // The toggle's memory is dropped on the way: what is stored is now what is in the box, so there is
        // no longer an "as it was" for it to go back to.
        this.run(
            this.ensService.updateMessageBody(this.messageId, this.body),
            'Body saved',
            () => {
                this.unformatted = null;
                this.load();
            },
        );
    }

    /** Publishes what is in the box to the same topic, which leaves this message as it is. */
    publishAsNewMessage(): void {
        this.run(
            this.ensService.publishMessage(this.topicErn, this.body),
            'Published to ' + this.topicName + ' as a new message',
        );
    }

    /**
     * Takes the server's body into the box, unless it is being typed into.
     *
     * The page reloads itself on a timer, and an edit that vanished every auto-reload would be worse than
     * no editing at all. So a reload fills the box only while it still holds exactly what the server last
     * said; once it does not, the new answer updates what revert goes back to and leaves the typing alone.
     */
    private takeBody(message: TopicMessage | null): void {
        const body = message?.body ?? '';
        if (body === this.serverBody) {
            return;
        }
        const untouched = !this.bodyEdited;
        this.serverBody = body;
        if (untouched) {
            this.body = body;
        }
    }

    // -- the message itself --------------------------------------------------------------------------

    /**
     * Fans this one message out again, to every subscriber the topic has now.
     *
     * Now rather than then: a subscription made since the message was published receives it too, and one
     * that has since gone does not. Which is what makes this the way to deliver a corrected body - and the
     * way to send a message twice to anyone still subscribed, so it asks first.
     */
    resend(message: TopicMessage): void {
        this.confirmThen(
            {
                title: 'Resend message',
                message: `Send ${message.messageId} to every subscriber ${this.topicName} has now? Anyone still subscribed receives it a second time.`,
                confirm: 'Resend',
            },
            this.ensService.resendMessages(this.topicErn, message.messageId),
            'Resend started',
        );
    }
}

/**
 * The attributes, as rows, ordered by name so the table does not reshuffle itself on a reload.
 *
 * Called once per answer the store hands out rather than from the template, because `mat-table` takes the
 * rows by reference: a `[dataSource]` that is a function call is a new array on every change detection
 * pass, and the table answers that by rebuilding every row it has.
 *
 * A `binary` value stays the base64 the server sent, which is what an attribute of that type is on the
 * wire. Absent rather than empty is a message that has not been read yet, and answers with no rows.
 */
function attributeRows(attributes: Record<string, Variant> | undefined): MessageAttributeRow[] {
    return Object.entries(attributes ?? {})
        .map(([name, variant]) => ({
            name: name,
            type: variant?.type ?? 'string',
            value: variant?.value === null || variant?.value === undefined ? '' : String(variant.value),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

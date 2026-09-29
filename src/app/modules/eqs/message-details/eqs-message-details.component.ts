import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIcon} from '@angular/material/icon';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, map, Observable, Subscription} from 'rxjs';
import type {QueueMessage, Variant} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {prettyPrint} from '../../../shared/text-utils.component';
import {EqsService, queueNameOf} from '../service/eqs.service';
import {eqsMessageDetailsActions, eqsMessageDetailsSelectors} from './state/eqs-message-details.state';

/** One attribute, as the table shows it: euclid keys them by name, and a table wants rows. */
export interface MessageAttributeRow {
    name: string;
    type: string;
    value: string;
}

/**
 * One message on a queue: everything it carries, and the body itself.
 *
 * The message list has room for what tells two messages apart and deliberately no body column - a body is
 * arbitrarily large and rarely one line, so a preview of one was never enough to read and always enough to
 * crowd out the rest of the row. This is where the whole of it is read, along with the two things the list
 * cannot show at all: the sender's attributes and euclid's envelope.
 *
 * Looking rather than receiving. `get-message` leaves visibility alone and does not count as a delivery, so
 * opening a message here neither hides it from whatever is consuming the queue nor moves it any closer to
 * the dead letter queue - which matters, because `receivedCount` against the queue's maximum is what sends
 * it there.
 *
 * The body is editable, and saving it is a rewrite in place: the message keeps its ID, its attributes and
 * its delivery count, and whatever is waiting to consume it sees the new body. Sending it to the queue
 * afresh is the other thing that can be done with an edit and a different thing entirely - it leaves this
 * message alone and makes a second one - so the two are separate buttons rather than one that guesses.
 */
@Component({
    selector: 'eqs-message-details',
    templateUrl: './eqs-message-details.component.html',
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
export class EqsMessageDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    message$!: Observable<QueueMessage | null>;
    attributes$!: Observable<MessageAttributeRow[]>;
    systemAttributes$!: Observable<MessageAttributeRow[]>;
    error$!: Observable<string | null>;

    readonly attributeColumns = ['name', 'value', 'type'];

    /** Which message this page is about, and the queue it is on. Nothing here moves a message. */
    queueErn = '';
    messageId = '';

    /** The body as the box has it, which is what a send takes and what the user has been typing into. */
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

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly eqsService = inject(EqsService);

    private readonly subscriptions = new Subscription();

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get queueName(): string {
        return queueNameOf(this.queueErn);
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
        this.queueErn = this.route.snapshot.paramMap.get('queueErn') ?? '';
        this.messageId = this.route.snapshot.paramMap.get('messageId') ?? '';
        this.message$ = this.store.select(eqsMessageDetailsSelectors.selectMessage);
        this.attributes$ = this.message$.pipe(map(message => attributeRows(message?.attributes)));
        this.systemAttributes$ = this.message$.pipe(map(message => attributeRows(message?.systemAttributes)));
        this.error$ = this.store.select(eqsMessageDetailsSelectors.selectError);

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
        this.store.dispatch(eqsMessageDetailsActions.load({messageId: this.messageId}));
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
     * formatted body saved back is a different message from the one that was sent.
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
     * The reload that follows is what clears the "edited" mark: it brings back what the server now holds,
     * which the box already matches, so {@link bodyEdited} goes quiet by agreeing rather than by being
     * reset. A save that was refused leaves the edit where it is, to be corrected and tried again.
     */
    saveBody(): void {
        // The toggle's memory is dropped on the way: what is stored is now what is in the box, so there is
        // no longer an "as it was" for it to go back to.
        this.run(
            this.eqsService.updateMessageBody(this.messageId, this.body),
            'Body saved',
            () => {
                this.unformatted = null;
                this.load();
            },
        );
    }

    /**
     * Sends what is in the box to the same queue as a new message.
     *
     * Deliberately not what the save button does: what arrives on the queue is a second message with its
     * own ID, and the one this page is about is left exactly as it was - body, attributes, delivery count
     * and all. Useful for replaying a message with a correction rather than correcting it.
     */
    sendAsNewMessage(): void {
        this.run(
            this.eqsService.sendMessage(this.queueErn, this.body),
            'Sent to ' + this.queueName + ' as a new message',
        );
    }

    /**
     * Takes the server's body into the box, unless it is being typed into.
     *
     * The page reloads itself on a timer, and an edit that vanished every auto-reload would be worse than
     * no editing at all. So a reload fills the box only while it still holds exactly what the server last
     * said; once it does not, the new answer updates what revert goes back to and leaves the typing alone.
     */
    private takeBody(message: QueueMessage | null): void {
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
     * Deletes the message and leaves for the queue's listing.
     *
     * By ID rather than by receipt handle, which is what the list does too: the handle is a lease, and this
     * has to work on a message nobody has received. Reloading afterwards is what every other action in
     * these views does and the one thing this one must not do - the message is gone, so reading it back
     * would answer with an error rather than a refresh.
     */
    deleteMessage(message: QueueMessage): void {
        this.confirmThen(
            {title: 'Delete message', message: `Delete message ${message.messageId}? This cannot be undone.`},
            this.eqsService.deleteMessageById(message.messageId),
            'Message deleted',
            () => void this.router.navigate(['/eqs-queue-list', 'messages', this.queueErn]),
        );
    }
}

/**
 * One attribute map, as rows, ordered by name so the table does not reshuffle itself on a reload.
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

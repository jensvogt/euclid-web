import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';
import type {Key} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag, ResourceTagsComponent} from '../../../shared/tags/resource-tags.component';
import {DEFAULT_PENDING_WINDOW_DAYS, EkmService} from '../service/ekm.service';
import {ekmKeyDetailsActions, ekmKeyDetailsSelectors} from './state/ekm-key-details.state';

/** The one status in which a key still encrypts. The other two decrypt and no more. */
const AVAILABLE = 'AVAILABLE';

/**
 * One encryption key: what it is for, what it may still do, and how long it has.
 *
 * The three statuses are the point of the page. Only an `AVAILABLE` key encrypts; a `REVOKED` one and one
 * in `PENDING_DELETION` still decrypt, so neither makes anything unreadable - until the deletion date
 * passes, which is the one thing here that nothing can undo. A list has room for the word and not for
 * what it means.
 */
@Component({
    selector: 'ekm-key-details',
    templateUrl: './ekm-key-details.component.html',
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
export class EkmKeyDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    key$!: Observable<Key | null>;
    error$!: Observable<string | null>;

    /** The key this page is about, by name - which is what `get-key` and `delete-key` take. */
    name = '';

    protected readonly dateConversion = dateConversion;
    protected readonly available = AVAILABLE;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly ekmService = inject(EkmService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.key$ = this.store.select(ekmKeyDetailsSelectors.selectKey);
        this.error$ = this.store.select(ekmKeyDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.name) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(ekmKeyDetailsActions.load({name: this.name}));
    }

    // -- the key -------------------------------------------------------------------------------------

    /** What a key says it is for. Months later it is the only thing that answers whether it can be deleted. */
    setDescription(key: Key): void {
        this.addThen(
            'Describe ' + key.name,
            [{
                name: 'description',
                label: 'Description',
                value: key.description,
                hint: 'What this key protects. Empty clears it.',
            }],
            values => this.ekmService.setKeyDescription(key.ern, String(values['description'])),
            'Description changed',
            'Save',
        );
    }

    /**
     * Takes the key out of use, without destroying anything.
     *
     * The difference from deleting it: nothing becomes unreadable. A revoked key still decrypts, so this
     * is what to reach for when a key should no longer be used but the data under it is still wanted.
     */
    revokeKey(key: Key): void {
        this.confirmThen(
            {
                title: 'Revoke key',
                message: `Stop ${key.name} encrypting anything further? What it already encrypted stays readable - it keeps decrypting.`,
                confirm: 'Revoke',
            },
            this.ekmService.revokeKey(key.ern),
            'Key revoked',
        );
    }

    /**
     * Schedules the key for deletion, and stays on the page.
     *
     * Unlike every other delete in this UI this does not remove anything: the key stays, in
     * `PENDING_DELETION`, until the window closes. So the page reloads rather than navigating away -
     * the date it now carries is the thing worth looking at.
     */
    deleteKey(key: Key): void {
        this.addThen(
            'Schedule ' + key.name + ' for deletion',
            [{
                name: 'days',
                label: 'Days until it goes',
                type: 'number',
                required: true,
                value: DEFAULT_PENDING_WINDOW_DAYS,
                hint: 'The key decrypts until then. After that, everything it encrypted is unreadable for good.',
            }],
            values => this.ekmService.deleteKey(key.name, Number(values['days'])),
            'Key scheduled for deletion',
            'Schedule',
        );
    }

    // -- tags ----------------------------------------------------------------------------------------

    /**
     * Tags the key, or changes a tag's value.
     *
     * One action for both, because EKM has one: `add-key-tag` upserts, so there is no `set-key-tag` to
     * tell adding from overwriting - and the dialog says which of the two is happening in its title.
     */
    setTag(key: Key, tag?: ResourceTag): void {
        this.addThen(
            tag ? 'Edit ' + tag.key : 'Add a tag to ' + key.name,
            tag
                ? [{name: 'value', label: 'Value', value: tag.value, hint: 'Currently ' + (tag.value || 'empty')}]
                : [
                    {name: 'key', label: 'Key', required: true},
                    {name: 'value', label: 'Value'},
                ],
            values => this.ekmService.addKeyTag(
                key.ern,
                tag ? tag.key : String(values['key']),
                String(values['value']),
            ),
            tag ? 'Tag changed' : 'Tag added',
            tag ? 'Save' : 'Add',
        );
    }

    deleteTag(key: Key, tag: ResourceTag): void {
        this.confirmThen(
            {title: 'Delete tag', message: `Remove the tag ${tag.key} from ${key.name}?`},
            this.ekmService.deleteKeyTag(key.ern, tag.key),
            'Tag deleted',
        );
    }
}

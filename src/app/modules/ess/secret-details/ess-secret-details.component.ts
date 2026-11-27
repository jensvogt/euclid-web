import {Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy} from '@angular/core';
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
import type {Secret, SecretValue} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag, ResourceTagsComponent} from '../../../shared/tags/resource-tags.component';
import {EssService} from '../service/ess.service';
import {essSecretDetailsActions, essSecretDetailsSelectors} from './state/ess-secret-details.state';
import {textOf} from '../../../shared/resource-add/resource-add.component';

/**
 * One secret: everything about it except, until asked, the one thing it is.
 *
 * The page loads metadata only. `get-secret` is the action that decrypts, and a page that reloads itself
 * every minute must not be the thing calling it - so the value arrives on an explicit reveal, is held in
 * a plain field rather than in the store, and goes again when the page does. That field is the only
 * place in this UI a secret's value lives, and {@link hide} and {@link ngOnDestroy} are the two ways out
 * of it.
 */
@Component({
    selector: 'ess-secret-details',
    templateUrl: './ess-secret-details.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
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
export class EssSecretDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    secret$!: Observable<Secret | null>;
    error$!: Observable<string | null>;

    /** The revealed value, for as long as it is shown. Never dispatched, never stored. */
    value: string | null = null;

    /** The secret this page is about, by name - which is what every ESS action takes. */
    name = '';

    /**
     * The namespace it is in, as the link here said - `undefined` when it did not, as an old bookmark won't.
     * A listing from the account root holds every namespace's secrets, so a name alone can be ambiguous.
     */
    namespace: string | undefined;

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly essService = inject(EssService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.namespace = this.route.snapshot.queryParamMap.get('namespace') ?? undefined;
        this.secret$ = this.store.select(essSecretDetailsSelectors.selectSecret);
        this.error$ = this.store.select(essSecretDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.hide();
        this.updateSubscription?.unsubscribe();
    }

    /** Metadata only. Revealing is a separate thing somebody asks for. */
    override load(): void {
        if (!this.name) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(essSecretDetailsActions.load({name: this.name, namespace: this.namespace}));
    }

    // -- the value -----------------------------------------------------------------------------------

    /** Fetches the value. The only call on this page that brings a secret into the browser. */
    reveal(secret: Secret): void {
        this.essService.getSecret(secret).subscribe({
            next: (result: SecretValue) => {
                this.value = result.value;
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    hide(): void {
        this.value = null;
    }

    // -- the secret ----------------------------------------------------------------------------------

    /**
     * Replaces the value, and hides whatever was on screen.
     *
     * The revealed value is the old one the moment this succeeds, and a page showing a secret that is no
     * longer the secret is worse than one showing none.
     */
    rotate(secret: Secret): void {
        this.addThen(
            'Rotate ' + secret.name,
            [{
                name: 'value',
                label: 'New value',
                type: 'password',
                required: true,
                hint: 'The version goes up by one. The old value is not kept.',
            }],
            values => this.essService.rotateSecret(secret, textOf(values['value'])),
            'Secret rotated',
            'Rotate',
            () => {
                this.hide();
                this.load();
            },
        );
    }

    /**
     * Changes the value, starting from the current one.
     *
     * Unlike {@link rotate}, which asks for a replacement blind, this decrypts the value first and offers it
     * for editing - an explicit ask, like {@link reveal}. The value in the dialog lives only as long as the
     * dialog does. If the value was on screen, the new one replaces it there; if it was hidden, it stays so.
     */
    editValue(secret: Secret): void {
        this.essService.getSecret(secret).subscribe({
            next: (current: SecretValue) => {
                const wasShown = this.value !== null;
                let edited = '';
                this.addThen(
                    'Edit ' + secret.name,
                    [{
                        name: 'value',
                        label: 'Value',
                        type: 'text',
                        required: true,
                        value: current.value,
                        hint: 'Saving bumps the version by one. The old value is not kept.',
                    }],
                    values => {
                        edited = textOf(values['value']);
                        return this.essService.updateSecret(secret, {value: edited});
                    },
                    'Secret value changed',
                    'Save',
                    () => {
                        this.value = wasShown ? edited : null;
                        this.load();
                    },
                );
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    setDescription(secret: Secret): void {
        this.addThen(
            'Description of ' + secret.name,
            [{
                name: 'description',
                label: 'Description',
                value: secret.description,
                hint: 'What this secret is for. Empty clears it.',
            }],
            values => this.essService.updateSecret(secret, {description: textOf(values['description'])}),
            'Description changed',
            'Save',
        );
    }

    /**
     * Re-encrypts the secret under another EKM key.
     *
     * How a secret is moved off a key that is being retired: the value is decrypted and written again
     * under the named key, so the old one is no longer what stands between this secret and nothing.
     */
    moveToKey(secret: Secret): void {
        this.addThen(
            'Encryption key for ' + secret.name,
            [{
                name: 'keyErn',
                label: 'Key ERN',
                required: true,
                value: secret.encryptionKeyErn,
                hint: 'The value is re-encrypted under this key. The key list can copy an ERN.',
            }],
            values => this.essService.updateSecret(secret, {keyErn: textOf(values['keyErn'])}),
            'Secret re-encrypted',
            'Save',
        );
    }

    /**
     * Deletes the secret and leaves for the list.
     *
     * Outright, with no window to change your mind in - unlike a key, which is scheduled. The value is
     * gone; the key it was under is left alone.
     */
    deleteSecret(secret: Secret): void {
        this.confirmThen(
            {
                title: 'Delete secret',
                message: `Delete ${secret.name}? The value is gone for good; the key it was under is left alone.`,
            },
            this.essService.deleteSecret(secret),
            'Secret deleted',
            () => {
                this.hide();
                void this.router.navigate(['/ess-secret-list']);
            },
        );
    }

    // -- tags ----------------------------------------------------------------------------------------

    /**
     * Tags the secret, or changes a tag's value.
     *
     * One action for both, because ESS has one: `add-secret-tag` upserts, so there is no `set-secret-tag`
     * to tell adding from overwriting - and the dialog's title says which of the two is happening.
     */
    setTag(secret: Secret, tag?: ResourceTag): void {
        this.addThen(
            tag ? 'Edit ' + tag.key : 'Add a tag to ' + secret.name,
            tag
                ? [{name: 'value', label: 'Value', value: tag.value, hint: 'Currently ' + (tag.value || 'empty')}]
                : [
                    {name: 'key', label: 'Key', required: true},
                    {name: 'value', label: 'Value'},
                ],
            values => this.essService.addSecretTag(
                secret,
                tag ? tag.key : textOf(values['key']),
                textOf(values['value']),
            ),
            tag ? 'Tag changed' : 'Tag added',
            tag ? 'Save' : 'Add',
        );
    }

    deleteTag(secret: Secret, tag: ResourceTag): void {
        this.confirmThen(
            {title: 'Delete tag', message: `Remove the tag ${tag.key} from ${secret.name}?`},
            this.essService.deleteSecretTag(secret, tag.key),
            'Tag deleted',
        );
    }
}

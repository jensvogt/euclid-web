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
import {interval, Observable, Subscription, tap} from 'rxjs';
import type {Bucket, RenameBucketResult} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {ResourceTag, ResourceTagsComponent} from '../../../shared/tags/resource-tags.component';
import {bucketNameOf, EsmService} from '../service/esm.service';
import {esmBucketDetailsActions, esmBucketDetailsSelectors} from './state/esm-bucket-details.state';

/**
 * One bucket: everything it records, and everything that can be changed about it.
 *
 * The list has room for what tells two buckets apart and no more, so what it leaves out - the owner, the
 * key a bucket encrypts under, its tags - is here, next to the actions that change them. The bucket menu
 * in the list stays as it is: it is the right place to do one thing to one of forty rows, and this is the
 * right place to look at one bucket and work on it.
 */
@Component({
    selector: 'esm-bucket-details',
    templateUrl: './esm-bucket-details.component.html',
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
export class EsmBucketDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    bucket$!: Observable<Bucket | null>;
    error$!: Observable<string | null>;

    /** The bucket this page is about. Not `readonly`: a rename gives the bucket a new one. */
    ern = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly esmService = inject(EsmService);

    private updateSubscription: Subscription | undefined;

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get bucketName(): string {
        return bucketNameOf(this.ern);
    }

    ngOnInit(): void {
        this.ern = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.bucket$ = this.store.select(esmBucketDetailsSelectors.selectBucket);
        this.error$ = this.store.select(esmBucketDetailsSelectors.selectError);
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
        this.store.dispatch(esmBucketDetailsActions.load({ern: this.ern}));
    }

    // -- the bucket itself ---------------------------------------------------------------------------

    /**
     * Renames the bucket, and follows it.
     *
     * A rename gives the bucket a new ERN and nothing answers to the old one afterwards, so this page
     * has to move to the new address before it reads the bucket back - otherwise the reload that follows
     * every action would ask for a bucket that no longer exists. The old URL is replaced rather than
     * pushed, because going back to it would land on that same missing bucket.
     */
    renameBucket(bucket: Bucket): void {
        this.addThen(
            'Rename ' + bucket.name,
            [{name: 'newName', label: 'New name', required: true, value: bucket.name}],
            values => this.esmService.renameBucket(bucket.ern, String(values['newName'])).pipe(
                tap((result: RenameBucketResult) => {
                    this.ern = result.ern;
                    void this.router.navigate(['/esm-bucket-list', 'bucket', result.ern], {replaceUrl: true});
                }),
            ),
            'Bucket renamed',
            'Rename',
        );
    }

    /**
     * Encrypts the bucket.
     *
     * An empty key ID is the usual answer: ESM mints a key for the bucket, and the point is that the
     * objects are encrypted rather than which key it was.
     */
    enableEncryption(bucket: Bucket): void {
        this.addThen(
            'Encrypt ' + bucket.name,
            [{
                name: 'keyId',
                label: 'Key ID',
                hint: 'Leave empty and ESM creates a key for this bucket.',
            }],
            values => this.esmService.enableEncryption(bucket.ern, String(values['keyId'])),
            'Encryption enabled',
            'Encrypt',
        );
    }

    disableEncryption(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Disable encryption',
                message: `Stop encrypting new objects in ${bucket.name}? Objects already encrypted stay encrypted and readable.`,
                confirm: 'Disable',
            },
            this.esmService.disableEncryption(bucket.ern),
            'Encryption disabled',
        );
    }

    /** Marks the bucket as euclid's own plumbing, or stops doing so. Reversible, which is why it is a toggle. */
    toggleInternal(bucket: Bucket): void {
        this.confirmThen(
            {
                title: bucket.internal ? 'Make visible' : 'Mark as internal',
                message: bucket.internal
                    ? `Show ${bucket.name} in ordinary bucket listings again?`
                    : `Mark ${bucket.name} as one of euclid's own buckets? It is left out of ordinary listings.`,
                confirm: bucket.internal ? 'Make visible' : 'Mark',
            },
            this.esmService.setBucketInternal(bucket.ern, !bucket.internal),
            bucket.internal ? 'Bucket is visible' : 'Bucket marked as internal',
        );
    }

    purgeBucket(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Purge bucket',
                message: `Delete all ${bucket.objects} objects in ${bucket.name} and keep the bucket? This cannot be undone.`,
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(bucket.ern),
            'Bucket purged',
        );
    }

    /**
     * Deletes the bucket and leaves for the list.
     *
     * Reloading afterwards is what every other action here does and the one thing this one must not do:
     * the bucket this page is about is gone, so reading it back would answer with an error rather than a
     * refresh.
     *
     * The objects go with it - the server stopped refusing a bucket that has them - so the message counts
     * them rather than offering to purge first, which is now a way of doing half of this.
     */
    deleteBucket(bucket: Bucket): void {
        this.confirmThen(
            {
                title: 'Delete bucket',
                message: bucket.objects > 0
                    ? `Delete ${bucket.name} and the ${bucket.objects} objects in it? This cannot be undone, and the bucket stays listed until the server has worked through them.`
                    : `Delete ${bucket.name}? This cannot be undone.`,
            },
            this.esmService.deleteBucket(bucket.ern, bucket.objects > 0),
            'Bucket deleted',
            () => void this.router.navigate(['/esm-bucket-list']),
        );
    }

    // -- tags ----------------------------------------------------------------------------------------

    /**
     * Adds a tag.
     *
     * `add-bucket-tag` rather than `set-bucket-tag`: adding is what this is, and a key the bucket already
     * carries keeps the value it has rather than quietly losing it to whatever was typed here. The reload
     * that follows shows which of the two happened - {@link editTag} is how a value is meant to change.
     */
    addTag(bucket: Bucket): void {
        this.addThen(
            'Add a tag to ' + bucket.name,
            [
                {name: 'key', label: 'Key', required: true},
                {name: 'value', label: 'Value'},
            ],
            values => this.esmService.addBucketTag(bucket.ern, String(values['key']), String(values['value'])),
            'Tag added',
            'Add',
        );
    }

    /**
     * Changes a tag's value.
     *
     * Only the value is asked for: changing the key would leave the old tag behind rather than rename it,
     * so the dialog names the key in its title and offers what it is set to now. `set-bucket-tag` rather
     * than `add-bucket-tag`, because overwriting is the whole point of this one.
     */
    editTag(bucket: Bucket, tag: ResourceTag): void {
        this.addThen(
            'Edit ' + tag.key,
            [{name: 'value', label: 'Value', value: tag.value, hint: 'Currently ' + (tag.value || 'empty')}],
            values => this.esmService.setBucketTag(bucket.ern, tag.key, String(values['value'])),
            'Tag changed',
            'Save',
        );
    }

    deleteTag(bucket: Bucket, tag: ResourceTag): void {
        this.confirmThen(
            {title: 'Delete tag', message: `Remove the tag ${tag.key} from ${bucket.name}?`},
            this.esmService.deleteBucketTag(bucket.ern, tag.key),
            'Tag deleted',
        );
    }
}

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
import {interval, map, Observable, Subscription, tap} from 'rxjs';
import type {EsmObject, Variant} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {bucketNameOf, EsmService} from '../service/esm.service';
import {esmObjectDetailsActions, esmObjectDetailsSelectors} from './state/esm-object-details.state';

/** One attribute, as the table shows it: euclid keys them by name, and a table wants rows. */
export interface ObjectAttributeRow {
    name: string;
    type: string;
    value: string;
}

/**
 * The types euclid stores an attribute under.
 *
 * Offered as they are rather than narrowed to the two anybody types by hand, because the dialog that
 * edits an attribute starts from the type it already has: a list without `binary` in it would silently
 * turn a binary attribute into a string the first time somebody corrected its value.
 */
const VARIANT_TYPES = ['string', 'int', 'long', 'float', 'double', 'bool', 'binary'];

/**
 * One stored object: everything it records, and everything that can be done to it.
 *
 * The object list has room for what tells two objects apart, so what it leaves out - the ERN, the
 * checksum, the attributes somebody hung off it - is here, next to the actions that change them. Reached
 * by bucket and key rather than by ERN, because the key is what identifies an object within its bucket
 * and what the server's own rename and transfer actions take.
 */
@Component({
    selector: 'esm-object-details',
    templateUrl: './esm-object-details.component.html',
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
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EsmObjectDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    object$!: Observable<EsmObject | null>;
    attributes$!: Observable<ObjectAttributeRow[]>;
    error$!: Observable<string | null>;

    readonly attributeColumns = ['name', 'value', 'type', 'actions'];

    /** Which object this page is about. Neither is `readonly`: a rename or a move changes both. */
    bucketErn = '';
    key = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly esmService = inject(EsmService);

    private updateSubscription: Subscription | undefined;

    /** The heading, from the moment the page opens rather than from the moment the server answers. */
    get bucketName(): string {
        return bucketNameOf(this.bucketErn);
    }

    ngOnInit(): void {
        this.bucketErn = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.key = this.route.snapshot.paramMap.get('key') ?? '';
        this.object$ = this.store.select(esmObjectDetailsSelectors.selectObject);
        this.attributes$ = this.store.select(esmObjectDetailsSelectors.selectAttributes).pipe(map(attributeRows));
        this.error$ = this.store.select(esmObjectDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.bucketErn || !this.key) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(esmObjectDetailsActions.load({bucketErn: this.bucketErn, key: this.key}));
    }

    // -- the object itself ---------------------------------------------------------------------------

    /**
     * Renames the object within its bucket, and follows it.
     *
     * The key is half of this page's address, so it has to move to the new one before it reads the object
     * back - otherwise the reload that follows every action would ask for a key that is no longer there.
     * The old URL is replaced rather than pushed, because going back to it would land on that same
     * missing object.
     */
    renameObject(object: EsmObject): void {
        this.addThen(
            'Rename ' + object.key,
            [{name: 'newKey', label: 'New key', required: true, value: object.key}],
            values => this.esmService.renameObject(object.bucketErn, object.key, String(values['newKey'])).pipe(
                tap((renamed: EsmObject) => this.follow(renamed)),
            ),
            'Object renamed',
            'Rename',
        );
    }

    /** Copies the object and stays put: the source is what this page is about, and it is still here. */
    copyObject(object: EsmObject): void {
        this.addThen(
            'Copy ' + object.key,
            [
                {name: 'targetBucketErn', label: 'Target bucket ERN', required: true, value: object.bucketErn},
                {name: 'targetKey', label: 'Target key', required: true, value: object.key},
            ],
            values => this.esmService.copyObject(
                object.bucketErn,
                object.key,
                String(values['targetBucketErn']),
                String(values['targetKey']),
            ),
            'Object copied',
            'Copy',
        );
    }

    /** Moves the object and follows it, which may be into another bucket. */
    moveObject(object: EsmObject): void {
        this.addThen(
            'Move ' + object.key,
            [
                {name: 'targetBucketErn', label: 'Target bucket ERN', required: true, value: object.bucketErn},
                {name: 'targetKey', label: 'Target key', required: true, value: object.key},
            ],
            values => this.esmService.moveObject(
                object.bucketErn,
                object.key,
                String(values['targetBucketErn']),
                String(values['targetKey']),
            ).pipe(tap((moved: EsmObject) => this.follow(moved))),
            'Object moved',
            'Move',
        );
    }

    /**
     * Deletes the object and leaves for the bucket's listing.
     *
     * Reloading afterwards is what every other action here does and the one thing this one must not do:
     * the object this page is about is gone, so reading it back would answer with an error rather than a
     * refresh.
     */
    deleteObject(object: EsmObject): void {
        this.confirmThen(
            {title: 'Delete object', message: `Delete ${object.key}? This cannot be undone.`},
            this.esmService.deleteObject(object.ern),
            'Object deleted',
            () => void this.router.navigate(['/esm-bucket-list', 'objects', this.bucketErn]),
        );
    }

    // -- attributes ----------------------------------------------------------------------------------

    /**
     * Adds an attribute.
     *
     * `add-object-attribute` rather than `set-object-attribute`: adding is what this is, and a name the
     * object already carries keeps the value it has rather than quietly losing it to whatever was typed
     * here. {@link editAttribute} is how a value is meant to change.
     */
    addAttribute(object: EsmObject): void {
        this.addThen(
            'Add an attribute to ' + object.key,
            [
                {name: 'name', label: 'Name', required: true},
                {name: 'value', label: 'Value'},
                {name: 'type', label: 'Type', type: 'select', options: VARIANT_TYPES, value: 'string'},
            ],
            values => this.esmService.addObjectAttribute(
                object.ern,
                String(values['name']),
                variantOf(String(values['type']), String(values['value'])),
            ),
            'Attribute added',
            'Add',
        );
    }

    /**
     * Changes an attribute's value, and the type it is stored under.
     *
     * Only the name is left out: changing it would leave the old attribute behind rather than rename it,
     * so the dialog names it in its title. The type starts as the one the attribute already has.
     */
    editAttribute(object: EsmObject, attribute: ObjectAttributeRow): void {
        this.addThen(
            'Edit ' + attribute.name,
            [
                {name: 'value', label: 'Value', value: attribute.value},
                {name: 'type', label: 'Type', type: 'select', options: VARIANT_TYPES, value: attribute.type},
            ],
            values => this.esmService.setObjectAttribute(
                object.ern,
                attribute.name,
                variantOf(String(values['type']), String(values['value'])),
            ),
            'Attribute changed',
            'Save',
        );
    }

    deleteAttribute(object: EsmObject, attribute: ObjectAttributeRow): void {
        this.confirmThen(
            {title: 'Delete attribute', message: `Remove ${attribute.name} from ${object.key}?`},
            this.esmService.deleteObjectAttribute(object.ern, attribute.name),
            'Attribute deleted',
        );
    }

    /** Moves this page to where the object now is, so the reload that follows asks for the right one. */
    private follow(object: EsmObject): void {
        this.bucketErn = object.bucketErn;
        this.key = object.key;
        void this.router.navigate(
            ['/esm-bucket-list', 'objects', object.bucketErn, object.key],
            {replaceUrl: true},
        );
    }
}

/**
 * An object's attributes, as rows, ordered by name so the table does not reshuffle itself on a reload.
 *
 * Called once per answer the store hands out rather than from the template, because `mat-table` takes
 * the rows by reference: a `[dataSource]` that is a function call is a new array on every change
 * detection pass, and the table answers that by rebuilding every row it has.
 *
 * A `binary` value stays the base64 the server sent - it is what an attribute of that type is on the
 * wire, and it is what has to be typed back in to change one.
 */
function attributeRows(attributes: Record<string, Variant>): ObjectAttributeRow[] {
    return Object.entries(attributes)
        .map(([name, variant]) => ({
            name: name,
            type: variant?.type ?? 'string',
            value: variant?.value === null || variant?.value === undefined ? '' : String(variant.value),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * What the user typed, tagged with the type they chose.
 *
 * The dialog answers in strings whatever the field was, so a numeric type has to be converted back or
 * the server is handed `"17"` where it was told to expect a number. An unreadable number is sent as
 * zero rather than as `NaN`, which is not JSON and would be dropped on the way out.
 */
function variantOf(type: string, value: string): Variant {
    switch (type) {
        case 'int':
        case 'long':
        case 'float':
        case 'double':
            return {type: type, value: Number(value) || 0};
        case 'bool':
            return {type: type, value: value.trim().toLowerCase() === 'true'};
        default:
            return {type: type, value: value};
    }
}

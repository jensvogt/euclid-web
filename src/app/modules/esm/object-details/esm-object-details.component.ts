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
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {HttpResponse} from '@angular/common/http';
import {Store} from '@ngrx/store';
import {from, interval, map, mergeMap, Observable, Subscription, tap} from 'rxjs';
import type {EsmObject, Variant} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {bucketNameOf, EsmService, MAX_INLINE_SIZE} from '../service/esm.service';
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
 * What an object's bytes turned out to be, and how they can be shown.
 *
 * `text` is the decoded object for a text one and a hex dump for a binary one, which is why `kind` is
 * carried separately: the box they are shown in is the same, what they mean is not.
 */
export interface ObjectContent {
    kind: 'text' | 'image' | 'binary';
    text: string;
    /** The same document laid out, or empty when it is neither JSON nor XML. */
    pretty: string;
    /** A blob URL, for an image. Revoked when it is replaced or the page is left. */
    url: string;
    /** What the server sent, kept so that saving it saves the object rather than what was shown of it. */
    blob: Blob;
    size: number;
    contentType: string;
    truncated: boolean;
}

/** How much of a text object is shown. A megabyte in a textarea is slow to type in and slow to scroll. */
const TEXT_PREVIEW = 100_000;

/** How far the formatted form is indented, which is what both JSON and XML are laid out with. */
const INDENT = '  ';

/** How many bytes of a binary object the hex dump covers, and how many go on one line. */
const HEX_PREVIEW = 1024;
const HEX_COLUMNS = 16;

/** The content types whose objects are text whatever the bytes look like. */
const TEXT_TYPES = /^text\/|^application\/(json|xml|javascript|ecmascript|x-yaml|yaml|x-sh|sql|graphql)|[+](json|xml)$/i;

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
        MatTabsModule,
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

    /** The object's bytes, and which key they are the bytes of. */
    content: ObjectContent | null = null;
    contentNote = '';
    contentLoading = false;
    contentKey = '';

    /** Whether the formatted form is the one on screen. Off by default: what was stored is what it is. */
    prettyPrinted = false;

    protected readonly maxInlineSize = MAX_INLINE_SIZE;

    /** Which object this page is about. Neither is `readonly`: a rename or a move changes both. */
    bucketErn = '';
    key = '';

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly esmService = inject(EsmService);

    private updateSubscription: Subscription | undefined;
    private objectSubscription: Subscription | undefined;

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

        // The content tab is the one that opens, so the bytes are read as soon as there is an object to
        // read them from - and read again when the page comes to be about a different object, which a
        // rename or a move makes it. Not on every answer: the page re-reads the object every minute, and
        // the bytes are a download rather than a row.
        this.objectSubscription = this.object$.subscribe((object: EsmObject | null) => {
            if (object) {
                this.readOnce(object);
            }
        });
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
        this.objectSubscription?.unsubscribe();
        this.release();
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

    // -- the bytes -----------------------------------------------------------------------------------

    /**
     * Reads the bytes if they have not been read for this key already.
     *
     * A failure counts as having been read: the object is re-read every minute, and retrying the bytes on
     * each of those would be a refusal a minute for as long as the page is open. The refresh button in
     * the tab is how a read is asked for again.
     */
    private readOnce(object: EsmObject): void {
        if (this.contentLoading) {
            return;
        }
        if (this.contentKey === object.key && (this.content !== null || this.contentNote !== '')) {
            return;
        }
        this.loadContent(object);
    }

    loadContent(object: EsmObject): void {
        this.contentKey = object.key;
        this.prettyPrinted = false;
        // Refused here rather than by the server, which would refuse it too: the size is already known
        // from the row, so an object that cannot be shown costs no request at all.
        if (object.size > MAX_INLINE_SIZE) {
            this.release();
            this.contentNote = `${byteConversion(object.size)} is too much to show here`
                + ` - the limit is ${byteConversion(MAX_INLINE_SIZE)}. Download it with the CLI instead:`
                + ` euclid-cli esm download-file --bucket ${bucketNameOf(object.bucketErn)}`
                + ` --key ${object.key} --file <path>`;
            return;
        }
        this.contentLoading = true;
        this.contentNote = '';
        this.esmService.getObjectBytes(object.bucketErn, object.key).pipe(
            mergeMap((response: HttpResponse<Blob>) => from(contentOf(response, object.contentType))),
        ).subscribe({
            next: (content: ObjectContent) => {
                this.contentLoading = false;
                this.release();
                this.content = content;
            },
            error: (error: Error) => {
                this.contentLoading = false;
                this.release();
                this.contentNote = error.message;
            },
        });
    }

    /**
     * Saves the bytes that were read, rather than asking for them again.
     *
     * What is saved is the object and not the preview: a text object shown cut at a hundred thousand
     * characters still writes out whole, because what the server sent is kept beside what was made of it.
     * Nothing is offered for an object too large to have been read - the multipart download the server
     * has for those is not something a browser tab should be assembling in memory.
     */
    downloadContent(object: EsmObject): void {
        if (!this.content) {
            return;
        }
        const url = URL.createObjectURL(this.content.blob);
        const link = document.createElement('a');
        link.href = url;
        // The last segment of the key, so a key with slashes in it does not become a directory the
        // browser has nowhere to put.
        link.download = object.key.split('/').pop() || object.key;
        link.click();
        URL.revokeObjectURL(url);
    }

    /** What is in the box: the object as stored, or the same thing laid out. */
    shownText(content: ObjectContent): string {
        return this.prettyPrinted && content.pretty ? content.pretty : content.text;
    }

    /** Drops what was read, and the blob URL with it: an image's URL holds the bytes alive until revoked. */
    private release(): void {
        if (this.content?.url) {
            URL.revokeObjectURL(this.content.url);
        }
        this.content = null;
    }

    /** Moves this page to where the object now is, so the reload that follows asks for the right one. */
    private follow(object: EsmObject): void {
        this.bucketErn = object.bucketErn;
        this.key = object.key;
        // The bytes belonged to the key this page was about a moment ago, which is not this one.
        this.release();
        this.contentNote = '';
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

/**
 * What the bytes that came back can be shown as.
 *
 * An object carries a content type, and it is believed where it says something - an image is shown as
 * one - but it is not the last word: `put-object` defaults to `application/octet-stream`, so anything
 * uploaded by a client that said nothing arrives under a type that means "bytes" whatever is in it.
 * What settles it is whether the bytes decode as UTF-8 without a NUL in them, which text does and a PNG
 * does not. A type that claims text but will not decode is read as Latin-1 instead, which cannot fail:
 * showing the bytes as characters is more use than refusing to show a file somebody saved in another
 * encoding.
 */
async function contentOf(response: HttpResponse<Blob>, storedType: string): Promise<ObjectContent> {
    const blob = response.body ?? new Blob();
    const contentType = response.headers.get('content-type') || storedType || '';
    const common = {url: '', blob: blob, size: blob.size, contentType: contentType};

    if (/^image\//i.test(contentType)) {
        return {...common, kind: 'image', text: '', pretty: '', truncated: false, url: URL.createObjectURL(blob)};
    }

    const buffer = await blob.arrayBuffer();
    const decoded = decodeUtf8(buffer);
    if (decoded !== null && !decoded.includes('\u0000')) {
        return {...common, kind: 'text', ...cut(decoded)};
    }
    if (TEXT_TYPES.test(contentType)) {
        return {...common, kind: 'text', ...cut(new TextDecoder('windows-1252').decode(buffer))};
    }
    return {
        ...common,
        kind: 'binary',
        text: hexDump(buffer),
        pretty: '',
        truncated: buffer.byteLength > HEX_PREVIEW,
    };
}

/**
 * The text as it will be shown, laid out as well if it can be, and whether that is all of it.
 *
 * Both forms are cut, and both are made from the whole document rather than from the part that is
 * shown: formatting a JSON document that had its last ten kilobytes taken off would fail on a brace
 * that is not missing at all.
 */
function cut(text: string): {text: string; pretty: string; truncated: boolean} {
    const pretty = prettyPrint(text);
    return {
        text: text.length > TEXT_PREVIEW ? text.slice(0, TEXT_PREVIEW) : text,
        pretty: pretty.length > TEXT_PREVIEW ? pretty.slice(0, TEXT_PREVIEW) : pretty,
        truncated: text.length > TEXT_PREVIEW,
    };
}

/**
 * The document laid out, or nothing when it is not one.
 *
 * Tried rather than asked about: the content type is not to be trusted here - `put-object` defaults to
 * `application/octet-stream`, so most of what a client uploads without saying arrives under a type that
 * means nothing - and a parse either works or it does not. Nothing is also the answer for a document
 * that is already laid out, since a button that reformats what is in front of you to the same thing is
 * a button that looks broken.
 */
function prettyPrint(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
        return '';
    }
    const formatted = trimmed.startsWith('<') ? prettyXml(trimmed) : prettyJson(trimmed);
    // Against the trimmed form, so a document that is already laid out but ends in a newline counts as
    // laid out rather than offering a button that only takes the newline off.
    return formatted && formatted !== trimmed ? formatted : '';
}

/** JSON as the browser lays it out. Key order is the document's: `JSON.parse` keeps it. */
function prettyJson(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, INDENT.length);
    } catch {
        return '';
    }
}

/**
 * XML, one element to a line.
 *
 * Walked as a parsed document rather than reindented as text, because the places a newline may not go
 * are not visible from outside a parse: a `>` inside an attribute value, a comment, a CDATA section
 * holding markup of its own. A browser already has the parser, and one that reports a `parsererror`
 * element has told us this is not XML - which is also how a text file that merely starts with `<` ends
 * up offering no formatting rather than nonsense.
 *
 * What this cannot keep is whitespace that means something: an element holding both text and elements -
 * `<p>text <b>bold</b> tail</p>` - comes out over four lines, and the spaces either side of the bold run
 * with it. That is a view rather than the document, which is why the stored form is one button away and
 * why saving the object saves the bytes and not this.
 */
function prettyXml(text: string): string {
    const parsed = new DOMParser().parseFromString(text, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length > 0) {
        return '';
    }
    const lines: string[] = [];
    if (/^<\?xml[\s?]/.test(text)) {
        lines.push(text.slice(0, text.indexOf('?>') + 2));
    }
    for (const node of [...parsed.childNodes]) {
        writeXml(node, 0, lines);
    }
    return lines.join('\n');
}

/**
 * One node, and what is under it, as lines.
 *
 * An element whose content is one piece of text stays on its own line - `<key>value</key>` is a fact
 * about one thing, and splitting it over three lines hides that. Anything else is opened, indented and
 * closed, which is what makes the shape of a document visible at all.
 */
function writeXml(node: Node, depth: number, lines: string[]): void {
    const indent = INDENT.repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.nodeValue ?? '').trim();
        if (text) {
            lines.push(indent + escapeXml(text));
        }
        return;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
        lines.push(`${indent}<!--${node.nodeValue ?? ''}-->`);
        return;
    }
    if (node.nodeType === Node.CDATA_SECTION_NODE) {
        lines.push(`${indent}<![CDATA[${node.nodeValue ?? ''}]]>`);
        return;
    }
    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        const instruction = node as ProcessingInstruction;
        lines.push(`${indent}<?${instruction.target} ${instruction.data}?>`);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const element = node as Element;
    const attributes = [...element.attributes]
        .map(attribute => ` ${attribute.name}="${escapeXml(attribute.value)}"`)
        .join('');
    const children = [...element.childNodes].filter(child =>
        child.nodeType !== Node.TEXT_NODE || (child.nodeValue ?? '').trim() !== '');

    if (children.length === 0) {
        lines.push(`${indent}<${element.nodeName}${attributes}/>`);
        return;
    }
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
        const text = escapeXml((children[0].nodeValue ?? '').trim());
        lines.push(`${indent}<${element.nodeName}${attributes}>${text}</${element.nodeName}>`);
        return;
    }

    lines.push(`${indent}<${element.nodeName}${attributes}>`);
    for (const child of children) {
        writeXml(child, depth + 1, lines);
    }
    lines.push(`${indent}</${element.nodeName}>`);
}

/** The five characters that cannot be written as themselves in XML. */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** The bytes as UTF-8, or null when they are not valid UTF-8 - which is what `fatal` is for. */
function decodeUtf8(buffer: ArrayBuffer): string | null {
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(buffer);
    } catch {
        return null;
    }
}

/**
 * The first bytes as offset, hex and characters - what `hexdump -C` shows, for the same reason.
 *
 * A binary object has nothing readable to show, but its first bytes still answer the question somebody
 * opened the tab with: the magic number says whether this really is the PNG the key claims, and whether
 * anything was stored at all.
 */
function hexDump(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer.slice(0, HEX_PREVIEW));
    const lines: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += HEX_COLUMNS) {
        const row = bytes.subarray(offset, offset + HEX_COLUMNS);
        const hex = [...row].map(byte => byte.toString(16).padStart(2, '0')).join(' ');
        const printable = [...row].map(byte => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('');
        lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(HEX_COLUMNS * 3 - 1, ' ')}  ${printable}`);
    }
    return lines.join('\n');
}

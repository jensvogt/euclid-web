import {Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {MatDialogConfig} from '@angular/material/dialog';
import {of} from 'rxjs';
import type {EsmObject, PurgeBucketResult, StoredObject} from 'euclid-ndk';

import {byteConversion} from '../../../shared/byte-utils.component';
import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EsmObjectUploadDialog, ObjectUploadData} from '../object-upload/esm-object-upload.component';
import {
    bucketNameOf,
    EsmService,
    LEVEL_SEPARATOR,
    levelName,
    levelOf,
    UPLOADING,
} from '../service/esm.service';
import {esmObjectListFeature} from './state/esm-object-list.state';

/**
 * One folder of a bucket, as a row of the listing.
 *
 * A folder is not a thing euclid stores: it is the set of keys sharing a leading segment, and this row
 * stands for that set. `path` is the level it opens - `DLI145/` - and `name` is its last segment, which
 * is what the row prints.
 */
export interface FolderRow {
    path: string;
    name: string;
}

/** What a row of this listing is. A folder goes to its level; an object is a key with bytes behind it. */
export type ObjectRow = FolderRow | EsmObject;

/** Which of the two a row is, for the table and for the row definition that decides how to draw it. */
export function isFolderRow(row: ObjectRow): row is FolderRow {
    return (row as FolderRow).path !== undefined;
}

/**
 * One bucket's objects, arranged by the folders their keys describe.
 *
 * A bucket has no directories. A key is one opaque string, and a folder is nothing but the set of keys
 * sharing a leading segment up to a "/" - which is why the structure is derived from the keys rather
 * than read from anywhere, and why an empty folder is a thing that cannot exist.
 *
 * One listing holds both: a level's folders as rows above its objects, each folder opening onto its own
 * level. That is what a bucket looks like to whoever filled it, and it is the only arrangement in which
 * a root holding nothing but folders does not read as an empty bucket.
 *
 * Browsing and searching are the two questions a bucket can be asked, and they are not the same one.
 * Browsing shows one level: the objects directly in it, with what lies below as folders to open.
 * Searching matches a prefix against every key in the bucket and answers with the whole subtree, which
 * is what the prefix box has always done and what the tree switches off while it is on. The server
 * decides between them by the delimiter - see {@link EsmService.listLevel}.
 */
@Component({
    selector: 'esm-object-list',
    templateUrl: './esm-object-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EsmObjectListComponent extends EuclidListComponent<EsmObject> {

    override readonly feature: ListFeature<EsmObject> = esmObjectListFeature;
    // `status` earns its place: an object is written in two steps and the row is finished by the second,
    // so "is this object actually there yet" is a question a listing has to be able to answer.
    override readonly columns = ['key', 'size', 'contentType', 'status', 'encrypted', 'created', 'modified', 'actions'];

    bucketErn = '';

    /**
     * Whether the page is browsing a tree or searching the whole bucket.
     *
     * On by default: a bucket of any size is organised by somebody, and showing the root of that is more
     * use than the first ten of three million keys in alphabetical order. The menu switches it off, and
     * then this is the flat listing with its prefix box.
     */
    tree = true;

    /**
     * The rows on screen: this level's folders, and then its objects.
     *
     * One listing rather than a tree beside a table, because a folder and an object are two things found
     * in the same place and going into one is what somebody browsing is doing. The folders come whole -
     * the server answers a level with all of them - and the objects are the page beneath, which is why
     * the paginator counts objects and the folders sit above every page of them.
     */
    rows: ObjectRow[] = [];

    /** What the table draws a folder row with, which is the table's own `when` predicate. */
    protected readonly isFolderRow = (index: number, row: ObjectRow): boolean => isFolderRow(row);

    /**
     * The folder being browsed, and the text being looked for under it.
     *
     * Two fields rather than one, because the prefix the server is sent is made of both and neither can
     * be recovered from it: `2026/01/order` is the level `2026/01/` and the search `order`, and going up
     * a folder has to keep the search while changing the level.
     */
    levelValue = '';
    search = '';

    protected readonly levelName = levelName;
    protected readonly separator = LEVEL_SEPARATOR;

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    /** The two halves of a row list, held apart because they arrive from two places. */
    private directories: FolderRow[] = [];
    private objects: EsmObject[] = [];

    constructor(private readonly esmService: EsmService) {
        super();
    }

    override ngOnInit(): void {
        this.bucketErn = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.parent = this.bucketErn;
        this.delimiter = LEVEL_SEPARATOR;
        super.ngOnInit();
        this.loadDirectories();
        // The page of objects arrives through the store; the folders are read beside it. Either half
        // landing rebuilds the one list the table draws.
        this.items$.subscribe((items: EsmObject[]) => {
            this.objects = items;
            this.rebuild();
        });
    }

    // -- browsing ------------------------------------------------------------------------------------

    /** The level the table is showing. Empty while searching flat, where there is no level at all. */
    get level(): string {
        return this.tree ? this.levelValue : '';
    }

    /**
     * The path to the level on screen, as the parts somebody can go back to.
     *
     * The root is not in it: the bucket's own name stands for that, and it is already the heading.
     */
    get breadcrumb(): {name: string; path: string}[] {
        const segments = this.level.split(LEVEL_SEPARATOR).filter(segment => segment !== '');
        return segments.map((name, index) => ({
            name: name,
            path: segments.slice(0, index + 1).join(LEVEL_SEPARATOR) + LEVEL_SEPARATOR,
        }));
    }

    /**
     * Asks the server for whichever of the two questions the page is now asking.
     *
     * With nothing typed it is the level: a delimiter, and the path as the prefix. With something typed
     * it is a search under that level - the two run together as one prefix and the delimiter goes, which
     * is what makes the answer the whole subtree rather than one floor of it. The level is still in the
     * prefix, so a search finds what is below the folder on screen and nothing outside it.
     */
    private apply(): void {
        const searching = this.tree && this.search.trim() !== '';
        this.delimiter = this.tree && !searching ? LEVEL_SEPARATOR : '';
        if (this.tree) {
            this.prefixValue = this.levelValue + this.search.trim();
        }
        this.prefixSet = this.prefixValue !== '';
        this.pageIndex = 0;
        this.load();
        this.loadDirectories();
    }

    /** Looks for keys under this folder that start with what was typed. */
    setSearch(): void {
        this.apply();
    }

    /** Back to browsing the folder, which is what an empty box means. */
    unsetSearch(): void {
        this.search = '';
        this.apply();
    }

    /**
     * Browsing or searching the whole bucket, which the server is asked differently.
     *
     * The prefix survives the switch, because a level is a legal prefix: leaving `2026/01/` searches the
     * bucket for every key starting with it, which is the same place seen the other way.
     */
    toggleTree(): void {
        this.tree = !this.tree;
        if (this.tree) {
            // Back from a flat search: whatever was typed there becomes the level, rounded up to one.
            this.levelValue = levelOf(this.prefixValue);
            this.search = '';
        }
        this.apply();
    }

    /** Goes into a folder, which is the one thing a folder row does. */
    openLevel(path: string): void {
        // The search is kept: moving to another folder with something typed is still that search, asked
        // about another place. The box stays on screen saying so.
        this.levelValue = path;
        this.apply();
    }

    /**
     * The key as the row prints it: what is left of it below the folder being looked at.
     *
     * Browsing a level, that is the object's own name - everything in front of it is the folder the page
     * is already showing, repeated down the column. Searching under a folder, it is the path from that
     * folder down, which is what tells two matches apart; searching the whole bucket there is no folder
     * to be relative to and the key is printed whole.
     *
     * What is shown and what the row *is* are different things: the link, the copy button and the
     * tooltip all carry the key itself, since that is what names the object everywhere else.
     */
    displayKey(object: EsmObject): string {
        const level = this.level;
        return level && object.key.startsWith(level) ? object.key.slice(level.length) : object.key;
    }

    /** Up one, which is where a folder row's parent is. Already at the root, this does nothing. */
    openParent(): void {
        const segments = this.levelValue.split(LEVEL_SEPARATOR).filter(segment => segment !== '');
        segments.pop();
        this.openLevel(segments.length === 0 ? '' : segments.join(LEVEL_SEPARATOR) + LEVEL_SEPARATOR);
    }

    /**
     * Reads the level again, folders and all, for the actions that change the shape of a bucket.
     *
     * Uploading a key with a new segment in it makes a folder; deleting the last key under one unmakes
     * it. Neither shows in a listing that only re-read its objects.
     */
    refreshTree(): void {
        this.load();
    }

    /**
     * The folders of the level being shown, which the table puts above the objects.
     *
     * Asked for separately from the page of objects, because the two are paged differently: the server
     * answers a level with every folder in it and one page of its objects. Nothing is asked for while
     * searching - a search is of the whole subtree, which has no one level to show the folders of.
     */
    private loadDirectories(): void {
        if (!this.tree || this.search.trim() !== '') {
            this.directories = [];
            this.rebuild();
            return;
        }
        this.esmService.listDirectories(this.bucketErn, this.levelValue).subscribe({
            next: (directories: string[]) => {
                this.directories = rowsOf(directories);
                this.rebuild();
            },
            error: () => {
                this.directories = [];
                this.rebuild();
            },
        });
    }

    /**
     * The rows, as one list.
     *
     * Rebuilt when either half arrives rather than composed in the template, because `mat-table` takes
     * its rows by reference: a `[dataSource]` that is a function call is a new array on every change
     * detection pass, and the table answers that by rebuilding every row it has.
     */
    private rebuild(): void {
        this.rows = [...this.directories, ...this.objects];
    }

    get bucketName(): string {
        return bucketNameOf(this.bucketErn);
    }

    /**
     * Stores a file in this bucket.
     *
     * Its own dialog rather than {@link addThen}'s, because none of what an upload takes is a string the
     * user types, and because the dialog sends the file itself - a large one goes up in parts over
     * minutes, and the bar reporting that has to be somewhere. So this waits for the object rather than
     * running an action: see {@link EsmObjectUploadDialog}.
     *
     * The prefix box goes in as the key's, which is what somebody looking at `2026/` and uploading a file
     * means by it.
     */
    uploadObject(): void {
        const dialogConfig = new MatDialogConfig();
        dialogConfig.disableClose = true;
        dialogConfig.autoFocus = true;
        // Wider than the string-collecting dialogs: this one has a file to name, a key that is a path and
        // hints that are sentences, and at their width those wrap into each other.
        dialogConfig.width = '52%';
        dialogConfig.minWidth = '560px';
        dialogConfig.data = {
            bucketErn: this.bucketErn,
            bucketName: this.bucketName,
            // The folder rather than the prefix, which while searching also holds what was typed: a file
            // uploaded from a search of "order" belongs in the folder, not under a key beginning "order".
            keyPrefix: this.tree ? this.levelValue : this.prefixValue,
        } as ObjectUploadData;

        this.dialog.open(EsmObjectUploadDialog, dialogConfig).afterClosed()
            .subscribe((stored: StoredObject | undefined) => {
                if (stored) {
                    this.run(of(stored), storedMessage(stored), () => this.refreshTree());
                }
            });
    }

    deleteObject(object: EsmObject): void {
        this.confirmThen(
            {title: 'Delete object', message: `Delete ${object.key}? This cannot be undone.`},
            this.esmService.deleteObject(object.ern),
            'Object deleted',
            () => this.refreshTree(),
        );
    }

    /** Deletes every object under whatever the prefix box currently holds, which may be everything. */
    purge(): void {
        const prefix = this.prefixValue;
        this.confirmThen(
            {
                title: 'Purge bucket',
                message: this.purgeMessage(prefix) + ' The page waits for the server to finish.',
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(this.bucketErn, prefix),
            'Objects deleted',
            () => this.refreshTree(),
        );
    }

    /**
     * The same purge, taken on rather than waited for.
     *
     * What a bucket of any size needs: deleting a million objects takes minutes, and a request held open
     * for all of it times out while the deleting carries on behind it - leaving a page that reports a
     * failure for work that is going perfectly well. The server writes the job down instead and answers
     * at once, so what there is to report is how much it took on rather than how much has gone.
     *
     * The reload that follows will still show objects, and that is not the purge having failed.
     */
    purgeInBackground(): void {
        const prefix = this.prefixValue;
        this.confirmThen(
            {
                title: 'Purge in the background',
                message: this.purgeMessage(prefix)
                    + ' The server works through them in the background, so they go on disappearing after this page says it is done.',
                confirm: 'Purge',
            },
            this.esmService.purgeBucket(this.bucketErn, prefix, true),
            (result: PurgeBucketResult) => purgeStarted(result),
            () => this.refreshTree(),
        );
    }

    private purgeMessage(prefix: string): string {
        return prefix
            ? `Delete every object in ${this.bucketName} whose key starts with "${prefix}"? This cannot be undone.`
            : `Delete every object in ${this.bucketName}? This cannot be undone.`;
    }
}

/**
 * What the server said it has, as a sentence.
 *
 * `complete-upload` answers as soon as it has taken the assembly on rather than when the object is
 * whole - the row is built by a pass that runs afterwards - so the answer often still reads `UPLOADING`.
 * Saying "uploaded" to that is how a page comes to claim something the storage does not yet agree with,
 * which is worth one extra sentence to avoid.
 */
function storedMessage(stored: StoredObject): string {
    return stored.status === UPLOADING
        ? `${stored.key} sent. The server is still assembling it - reload to watch the status.`
        : `${stored.key} uploaded`;
}

/**
 * What a background purge took on, as a sentence.
 *
 * `count` is what the bucket held when the job was written down rather than what has gone by now, so the
 * wording says "purging" rather than "purged". A server that decided to do it inline after all answers
 * with `background` false, and then the count is final.
 */
function purgeStarted(result: PurgeBucketResult): string {
    if (!result?.background) {
        return `${result?.count ?? 0} objects deleted`;
    }
    return result.jobId
        ? `Purging ${result.count} objects in the background (job ${result.jobId})`
        : `Purging ${result.count} objects in the background`;
}

/** The directories of one level as rows, in the order the server found them, which is key order. */
function rowsOf(directories: string[]): FolderRow[] {
    return directories.map(path => ({path: path, name: levelName(path)}));
}

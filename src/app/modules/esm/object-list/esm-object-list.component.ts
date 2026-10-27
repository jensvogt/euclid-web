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

/** One folder of a bucket, as the tree shows it: a path, and whether what is under it is on screen. */
export interface FolderNode {
    /** The level, ending in the separator: `2026/01/`. */
    path: string;
    /** Its last segment, which is what the tree prints. */
    name: string;
    depth: number;
    expanded: boolean;
    loading: boolean;
    /** Whether its children have been asked for, so a folder holding none is not asked about twice. */
    loaded: boolean;
    /** Its folders, kept while it is closed so that opening it again costs nothing. */
    children: FolderNode[];
}

/**
 * One bucket's objects, as a tree of the folders their keys describe.
 *
 * A bucket has no directories. A key is one opaque string, and a folder is nothing but the set of keys
 * sharing a leading segment up to a "/" - which is why the tree is built from the keys rather than read
 * from anywhere, and why an empty folder is a thing that cannot exist.
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

    /** The folders on screen, flattened: a tree is a list of rows that know their own depth. */
    nodes: FolderNode[] = [];

    protected readonly levelName = levelName;
    protected readonly separator = LEVEL_SEPARATOR;

    protected readonly byteConversion = byteConversion;
    protected readonly dateConversion = dateConversion;

    private readonly route = inject(ActivatedRoute);

    constructor(private readonly esmService: EsmService) {
        super();
    }

    override ngOnInit(): void {
        this.bucketErn = this.route.snapshot.paramMap.get('bucketErn') ?? '';
        this.parent = this.bucketErn;
        this.delimiter = LEVEL_SEPARATOR;
        super.ngOnInit();
        this.loadRoot();
    }

    // -- the tree ------------------------------------------------------------------------------------

    /** The level the table is showing, which in tree mode is what the prefix holds. */
    get level(): string {
        return this.tree ? this.prefixValue : '';
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
     * Browsing or searching, which the server is asked differently.
     *
     * The prefix survives the switch, because a level is a legal prefix: leaving the tree at `2026/01/`
     * searches the bucket for every key starting with it, which is the same place seen the other way.
     */
    toggleTree(): void {
        this.tree = !this.tree;
        this.delimiter = this.tree ? LEVEL_SEPARATOR : '';
        this.pageIndex = 0;
        if (this.tree) {
            this.prefixValue = levelOf(this.prefixValue);
            this.loadRoot();
        }
        this.load();
    }

    /** Shows one level, and leaves the tree as it is - what was open stays open. */
    openLevel(path: string): void {
        this.prefixValue = path;
        this.prefixSet = path !== '';
        this.pageIndex = 0;
        this.load();
    }

    /**
     * Opens or closes one folder.
     *
     * Children are asked for the first time a folder is opened and kept after that: a level's folders
     * cost one index seek each, but a tree somebody is clicking through would ask for the same ones
     * again on every open. Closing drops the rows below it from the screen rather than from the node, so
     * reopening is free.
     */
    toggleNode(node: FolderNode): void {
        if (node.expanded) {
            node.expanded = false;
            // What was open below closes with it. Reopening then shows this folder's own children rather
            // than restoring a shape somebody left three clicks ago and has since stopped expecting.
            for (const other of this.nodes) {
                if (isUnder(other, node)) {
                    other.expanded = false;
                }
            }
            this.nodes = this.nodes.filter(other => !isUnder(other, node));
            return;
        }

        node.expanded = true;
        if (node.loaded) {
            this.insert(node, node.children);
            return;
        }
        node.loading = true;
        this.esmService.listDirectories(this.bucketErn, node.path).subscribe({
            next: (directories: string[]) => {
                node.loading = false;
                node.loaded = true;
                node.children = nodesOf(directories, node.depth + 1);
                this.insert(node, node.children);
            },
            error: () => {
                node.loading = false;
                node.loaded = true;
                node.expanded = false;
            },
        });
    }

    /**
     * Shows a folder's contents and opens it in the tree, which is one gesture rather than two.
     *
     * A folder clicked in a tree is both "show me this" and "what is in it" - the chevron is there for
     * the second without the first, when somebody is looking for a path rather than at a level.
     */
    openNode(node: FolderNode): void {
        this.openLevel(node.path);
        if (!node.expanded) {
            this.toggleNode(node);
        }
    }

    /** Whether this node is the level the table is showing. */
    isOpen(node: FolderNode): boolean {
        return this.level === node.path;
    }

    /** The bucket's own folders, which is the tree's first row and the root the breadcrumb goes back to. */
    private loadRoot(): void {
        this.esmService.listDirectories(this.bucketErn, '').subscribe({
            next: (directories: string[]) => this.nodes = nodesOf(directories, 0),
            error: () => this.nodes = [],
        });
    }

    /** Puts a folder's children directly under it, which is where the screen expects them. */
    private insert(node: FolderNode, children: FolderNode[]): void {
        const at = this.nodes.indexOf(node);
        if (at < 0) {
            return;
        }
        this.nodes = [...this.nodes.slice(0, at + 1), ...children, ...this.nodes.slice(at + 1)];
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
            keyPrefix: this.prefixValue,
        } as ObjectUploadData;

        this.dialog.open(EsmObjectUploadDialog, dialogConfig).afterClosed()
            .subscribe((stored: StoredObject | undefined) => {
                if (stored) {
                    this.run(of(stored), storedMessage(stored));
                }
            });
    }

    deleteObject(object: EsmObject): void {
        this.confirmThen(
            {title: 'Delete object', message: `Delete ${object.key}? This cannot be undone.`},
            this.esmService.deleteObject(object.ern),
            'Object deleted',
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
function nodesOf(directories: string[], depth: number): FolderNode[] {
    return directories.map(path => ({
        path: path,
        name: levelName(path),
        depth: depth,
        expanded: false,
        loading: false,
        loaded: false,
        children: [],
    }));
}

/** Whether one row is somewhere below another, which is what closing a folder has to take off the screen. */
function isUnder(node: FolderNode, parent: FolderNode): boolean {
    return node !== parent && node.path.startsWith(parent.path);
}

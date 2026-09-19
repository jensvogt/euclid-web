import {Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTableModule} from '@angular/material/table';
import {MatTooltip} from '@angular/material/tooltip';

/** One tag, as the table shows it: euclid keys them by name, and a table wants rows. */
export interface ResourceTag {
    key: string;
    value: string;
}

/**
 * The tags on a resource, and the three things anyone does to them.
 *
 * One component rather than one per details page: a bucket's tags and a queue's are the same
 * `Record<string, string>` shown the same way, and only the actions behind the buttons differ - which is
 * why those are emitted rather than performed. The page that owns the resource owns the dialogs, because
 * that is where the service and {@link import("../resource/euclid-resource.component.js").EuclidResourceComponent}'s
 * confirmations are.
 *
 * The rows are rebuilt when the input changes rather than read in the template, because `mat-table` takes
 * them by reference: a `[dataSource]` that is a function call is a new array on every change detection
 * pass, and the table answers that by rebuilding every row it has - under the pointer, so the buttons
 * never see a click.
 */
@Component({
    selector: 'resource-tags',
    templateUrl: './resource-tags.component.html',
    styleUrls: ['../resource/details.component.scss'],
    standalone: true,
    imports: [MatCard, MatCardHeader, MatCardContent, MatIconButton, MatIcon, MatTooltip, MatTableModule],
})
export class ResourceTagsComponent implements OnChanges {

    /** The tags as euclid holds them. A new object from the store is what rebuilds the rows. */
    @Input() tags: Record<string, string> | undefined;

    /** What the resource is called, for the tooltips that name it. */
    @Input() resource = '';

    @Output() readonly add = new EventEmitter<void>();
    @Output() readonly edit = new EventEmitter<ResourceTag>();
    @Output() readonly remove = new EventEmitter<ResourceTag>();

    readonly columns = ['key', 'value', 'actions'];

    /** The tags as rows, ordered by key so the table does not reshuffle itself on a reload. */
    rows: ResourceTag[] = [];

    ngOnChanges(): void {
        this.rows = Object.entries(this.tags ?? {})
            .map(([key, value]) => ({key: key, value: String(value)}))
            .sort((left, right) => left.key.localeCompare(right.key));
    }
}

import {Component, EventEmitter, Input, OnChanges, Output, inject} from '@angular/core';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatPaginator, PageEvent} from '@angular/material/paginator';
import {MatTableModule} from '@angular/material/table';
import {MatTooltip} from '@angular/material/tooltip';
import type {Grant, Role} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EamService} from '../service/eam.service';

/** What `["*"]` means in a grant's scope, and what an empty scope is shown as. */
const EVERYTHING = '*';

/**
 * What one principal has been granted, and the two things anyone does to it.
 *
 * A grant is a role given to a *principal*, and a principal is a user or a group - one model, one set of
 * actions, one table. So this is a component rather than the same forty lines on the user page and the
 * group page, where the second copy would be the one that stops matching the first.
 *
 * It performs its own actions rather than emitting them, unlike
 * {@link import("../../../shared/tags/resource-tags.component.js").ResourceTagsComponent}: a grant is
 * made the same way whoever holds it - the dialog offers the account's roles and takes a scope - so
 * there is nothing for the page around it to decide. What that page does have to do is read itself
 * again afterwards, which is what {@link changed} is for.
 */
@Component({
    selector: 'eam-grants',
    templateUrl: './eam-grants.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    imports: [MatIconButton, MatIcon, MatTooltip, MatTableModule, MatPaginator, CdkCopyToClipboard],
})
export class EamGrantsComponent extends EuclidResourceComponent implements OnChanges {

    /** The grants as the server listed them. */
    @Input() grants: Grant[] = [];

    /**
     * Whether to page them here.
     *
     * `list-grants` answers with all of them at once - it is one query, and asking per page would be
     * several - so the paging is the browser's. Worth it for an account, whose grants are everybody's and
     * run to hundreds; not for a user, whose own grants fit on the screen and would gain a paginator that
     * only ever says "1 of 1".
     */
    @Input() pageable = false;

    /**
     * The principal they belong to: a user ERN or a user-group ERN, which is what says which.
     *
     * Empty for a listing that is not one principal's - an account's own overview of everything granted
     * in it. There is nothing to grant *to* then, so the table says who each grant is for instead of
     * offering to add one; granting is done from the user or the group that would hold it.
     */
    @Input() principal = '';

    /** What to call that principal in a dialog - a user ID or a group name. */
    @Input() principalName = '';

    /** Raised once a grant has been made or revoked, so the page around this reads itself again. */
    @Output() readonly changed = new EventEmitter<void>();

    /** The page being shown, which is all of them unless {@link pageable}. */
    rows: Grant[] = [];

    pageIndex = 0;
    pageSize = 10;
    readonly pageSizeOptions = [5, 10, 20, 50, 100];

    /** Who holds each grant is worth a column exactly when the table is not already about one holder. */
    get columns(): string[] {
        return this.principal
            ? ['role', 'namespaces', 'resources', 'granted', 'actions']
            : ['role', 'principal', 'namespaces', 'resources', 'granted', 'actions'];
    }

    protected readonly dateConversion = dateConversion;

    private readonly eamService = inject(EamService);

    /**
     * Cuts the page when the grants change, rather than in the template.
     *
     * `mat-table` takes its rows by reference, so a `[dataSource]` that slices in the template is a new
     * array on every change detection pass and a table that rebuilds every row it has - under the
     * pointer, so the buttons never see a click.
     */
    ngOnChanges(): void {
        this.cut();
    }

    handlePageEvent(event: PageEvent): void {
        this.pageSize = event.pageSize;
        this.pageIndex = event.pageIndex;
        this.cut();
    }

    /**
     * What "read it again" means here: telling the page to.
     *
     * {@link EuclidResourceComponent.run} reloads after every action it runs, and this component has
     * nothing of its own to reload - its grants are an input. So the reload is passed outward, and the
     * page that owns the principal is what asks the server.
     */
    override load(): void {
        this.changed.emit();
    }

    /** A grant's scope as a sentence, since `["*"]` is the common case and reads badly as itself. */
    scope(values: string[] | undefined): string {
        const scoped = values ?? [];
        if (scoped.length === 0 || scoped.includes(EVERYTHING)) {
            return 'all';
        }
        return scoped.join(', ');
    }

    /**
     * Gives the principal a role, scoped.
     *
     * The roles are read first so the dialog can offer them rather than ask for one to be typed: they
     * are per account, plus euclid's built-ins, and neither list is something to be remembered. A scope
     * left as `*` means every namespace and every resource, which is what the server defaults to.
     */
    grantRole(): void {
        this.eamService.listRoles(true).subscribe({
            next: (roles: Role[]) => this.askForGrant(roles.map((role: Role) => role.name)),
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    /** Who holds a grant, as something readable: the last segment of the ERN it names them by. */
    holder(grant: Grant): string {
        const principal = grant.principal ?? '';
        return principal.substring(principal.lastIndexOf(':') + 1) || '-';
    }

    revokeGrant(grant: Grant): void {
        this.confirmThen(
            {
                title: 'Revoke',
                message: `Take ${grant.role} away from ${this.principalName || this.holder(grant)}? A group may still confer it.`,
                confirm: 'Revoke',
            },
            this.eamService.revokeRole(grant.grantId),
            'Grant revoked',
        );
    }

    /** The grant dialog, once the roles it offers are known. */
    private askForGrant(roles: string[]): void {
        this.addThen(
            'Grant a role to ' + this.principalName,
            [
                {name: 'role', label: 'Role', type: 'select', options: roles, value: roles[0] ?? ''},
                {
                    name: 'namespaces',
                    label: 'Namespaces',
                    value: EVERYTHING,
                    hint: 'Comma-separated, or * for every namespace of the account.',
                },
                {
                    name: 'resources',
                    label: 'Resources',
                    value: EVERYTHING,
                    hint: 'ERN patterns, each exact or ending in *. A single * means every resource.',
                },
            ],
            values => this.eamService.grantRole(
                String(values['role']),
                this.principal,
                listOf(String(values['namespaces'])),
                listOf(String(values['resources'])),
            ),
            'Role granted',
            'Grant',
        );
    }

    /**
     * The rows this page shows.
     *
     * The index is taken back to the first page when it has fallen off the end, which a reload can do to
     * it: revoking the last grant on page four leaves an index pointing past a list that no longer has
     * one, and an empty table beside a paginator that disagrees is worse than starting again.
     */
    private cut(): void {
        if (!this.pageable) {
            this.rows = this.grants;
            return;
        }
        if (this.pageIndex > 0 && this.pageIndex * this.pageSize >= this.grants.length) {
            this.pageIndex = 0;
        }
        this.rows = this.grants.slice(this.pageIndex * this.pageSize, (this.pageIndex + 1) * this.pageSize);
    }
}

/** A comma-separated field as the array the server takes. Empty means everything, which is how it reads it. */
function listOf(value: string): string[] {
    const parts = value.split(',').map(part => part.trim()).filter(part => part.length > 0);
    return parts.length === 0 ? [EVERYTHING] : parts;
}

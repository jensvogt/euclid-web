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
import {Store} from '@ngrx/store';
import {interval, map, Observable, Subscription} from 'rxjs';
import type {Grant, UserGroup} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EamGrantsComponent} from '../grants/eam-grants.component';
import {EamService} from '../service/eam.service';
import {eamGroupDetailsActions, eamGroupDetailsSelectors} from './state/eam-group-details.state';

/** One member, as the table shows them: what the group recorded, and the ID to address them by. */
export interface GroupMember {
    /** What `userIds` held, which the actions that add and remove a member take. */
    ern: string;
    /** The last segment of that, which is the user ID - and what the user details page is addressed by. */
    userId: string;
}

/**
 * One user group: who is in it, and what it has been granted.
 *
 * The same two questions the user page asks, from the other side. A group is a principal like a user is,
 * so its grants are the same table - see {@link EamGrantsComponent} - and its members are the thing only
 * a group has. Whatever is granted here, every member has: that is what a group is for, and what makes
 * this page the shorter way to give twenty people the same role.
 */
@Component({
    selector: 'eam-group-details',
    templateUrl: './eam-group-details.component.html',
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
        EamGrantsComponent,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EamGroupDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    group$!: Observable<UserGroup | null>;
    members$!: Observable<GroupMember[]>;
    grants$!: Observable<Grant[]>;
    error$!: Observable<string | null>;

    readonly memberColumns = ['userId', 'ern', 'actions'];

    /** The group this page is about, by name - which is what the route carries and what deletes it. */
    name = '';

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly eamService = inject(EamService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.group$ = this.store.select(eamGroupDetailsSelectors.selectGroup);
        this.members$ = this.group$.pipe(map(group => group ? membersOf(group) : []));
        this.grants$ = this.store.select(eamGroupDetailsSelectors.selectGrants);
        this.error$ = this.store.select(eamGroupDetailsSelectors.selectError);
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
        this.store.dispatch(eamGroupDetailsActions.load({name: this.name}));
    }

    // -- the group -----------------------------------------------------------------------------------

    /**
     * Deletes the group and leaves for the list.
     *
     * The users in it are left alone - a group is a set, not an owner - but what it granted them goes
     * with it, which is the part worth saying out loud.
     */
    deleteGroup(group: UserGroup): void {
        this.confirmThen(
            {
                title: 'Delete user group',
                message: `Delete ${group.name}? The ${group.userIds?.length ?? 0} users in it are left alone, but whatever it granted them is not.`,
            },
            this.eamService.deleteUserGroup(group.name),
            'User group deleted',
            () => void this.router.navigate(['/eam-group-list']),
        );
    }

    // -- members -------------------------------------------------------------------------------------

    /** Both sides are ERNs, which is what the server takes - so the dialog asks for one rather than an ID. */
    addMember(group: UserGroup): void {
        this.addThen(
            'Add a user to ' + group.name,
            [{
                name: 'user',
                label: 'User ERN',
                required: true,
                hint: 'The ERN, which the user list can copy.',
            }],
            values => this.eamService.addUserToUserGroup(group.ern, String(values['user'])),
            'User added to group',
            'Add',
        );
    }

    removeMember(group: UserGroup, member: GroupMember): void {
        this.confirmThen(
            {
                title: 'Remove from group',
                message: `Take ${member.userId} out of ${group.name}? Whatever this group grants goes with it.`,
                confirm: 'Remove',
            },
            this.eamService.removeUserFromUserGroup(group.ern, member.ern),
            'User removed from group',
        );
    }
}

/**
 * A group's members, as rows, ordered by ID so the table does not reshuffle itself on a reload.
 *
 * Called once per group the store hands out rather than from the template, because `mat-table` takes the
 * rows by reference - see
 * {@link import("../../../shared/tags/resource-tags.component.js").ResourceTagsComponent}.
 *
 * `userIds` is named for an ID and holds an ERN, since the actions that add and remove a member take
 * ERNs. Taking the last segment gives the ID either way: a value that is already an ID has no colon in
 * it and comes back unchanged.
 */
function membersOf(group: UserGroup): GroupMember[] {
    return (group.userIds ?? [])
        .map((member: string) => ({ern: member, userId: member.substring(member.lastIndexOf(':') + 1)}))
        .sort((left, right) => left.userId.localeCompare(right.userId));
}

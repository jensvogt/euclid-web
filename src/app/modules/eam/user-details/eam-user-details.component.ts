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
import {interval, Observable, Subscription} from 'rxjs';
import type {Grant, User, UserGroup} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {EamGrantsComponent} from '../grants/eam-grants.component';
import {PASSWORD_FIELDS, withMatchingPassword} from '../password/change-password';
import {EamService} from '../service/eam.service';
import {eamUserDetailsActions, eamUserDetailsSelectors} from './state/eam-user-details.state';

/**
 * One user: who they are, what they may do, and what they are a member of.
 *
 * The grants are why this page exists. euclid 0.8 took `accountGrants` off the user and made a grant a
 * thing in its own right - a role, given to a principal, scoped to namespaces and resources - which left
 * the user list with nothing to show and no way to change it. This is where that went.
 *
 * What it shows is the user's *own* grants. A user may also be allowed something through a group they
 * are in, which is a different question and one euclid answers with `check-permission` rather than here;
 * the Groups tab is what says where else to look.
 */
@Component({
    selector: 'eam-user-details',
    templateUrl: './eam-user-details.component.html',
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
export class EamUserDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    user$!: Observable<User | null>;
    grants$!: Observable<Grant[]>;
    groups$!: Observable<UserGroup[]>;
    error$!: Observable<string | null>;

    readonly groupColumns = ['name', 'description', 'actions'];

    /** The user this page is about, by ID - which is what the route carries and what a heading wants. */
    userId = '';

    protected readonly dateConversion = dateConversion;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly eamService = inject(EamService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.userId = this.route.snapshot.paramMap.get('userId') ?? '';
        this.user$ = this.store.select(eamUserDetailsSelectors.selectUser);
        this.grants$ = this.store.select(eamUserDetailsSelectors.selectGrants);
        this.groups$ = this.store.select(eamUserDetailsSelectors.selectGroups);
        this.error$ = this.store.select(eamUserDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.userId) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(eamUserDetailsActions.load({userId: this.userId}));
    }

    // -- the user ------------------------------------------------------------------------------------

    /** Sets a new password. The old one is not asked for: this is an administrator changing somebody's. */
    changePassword(user: User): void {
        this.addThen(
            'Change the password for ' + user.userId,
            PASSWORD_FIELDS,
            values => withMatchingPassword(values, password => this.eamService.changePassword(user.userId, password)),
            'Password changed',
            'Change',
        );
    }

    /**
     * Deletes the user and leaves for the list.
     *
     * Reloading afterwards is what every other action here does and the one thing this one must not do:
     * the user this page is about is gone, so reading them back would answer with an error rather than a
     * refresh.
     */
    deleteUser(user: User): void {
        this.confirmThen(
            {title: 'Delete user', message: `Delete ${user.userId}? This cannot be undone.`},
            this.eamService.deleteUser(user.userId),
            'User deleted',
            () => void this.router.navigate(['/eam-user-list']),
        );
    }

    // -- groups --------------------------------------------------------------------------------------

    /** Both sides are ERNs, which is what the server takes - so the dialog asks for one rather than a name. */
    addToGroup(user: User): void {
        this.addThen(
            'Add ' + user.userId + ' to a group',
            [{
                name: 'group',
                label: 'Group ERN',
                required: true,
                hint: 'The ERN, which the user group list can copy.',
            }],
            values => this.eamService.addUserToUserGroup(String(values['group']), user.ern),
            'Added to group',
            'Add',
        );
    }

    removeFromGroup(user: User, group: UserGroup): void {
        this.confirmThen(
            {
                title: 'Remove from group',
                message: `Take ${user.userId} out of ${group.name}? Whatever that group was granted goes with it.`,
                confirm: 'Remove',
            },
            this.eamService.removeUserFromUserGroup(group.ern, user.ern),
            'Removed from group',
        );
    }
}

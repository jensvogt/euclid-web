import {Component} from '@angular/core';
import type {UserGroup} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EamService} from '../service/eam.service';
import {eamGroupListFeature} from './state/eam-group-list.state';

/** The user groups, and who is in them. Creating and deleting one is administrator-only. */
@Component({
    selector: 'eam-group-list',
    templateUrl: './eam-group-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EamGroupListComponent extends EuclidListComponent<UserGroup> {

    override readonly feature: ListFeature<UserGroup> = eamGroupListFeature;
    override readonly columns = ['name', 'description', 'members', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eamService: EamService) {
        super();
    }

    createGroup(): void {
        this.addThen(
            'Create user group',
            [
                {name: 'name', label: 'Name', required: true},
                {name: 'description', label: 'Description'},
            ],
            values => this.eamService.createUserGroup(String(values['name']), String(values['description'])),
            'User group created',
        );
    }

    /** Both sides are ERNs, which is what the server takes - so the dialog asks for one rather than a user ID. */
    addUser(group: UserGroup): void {
        this.addThen(
            'Add a user to ' + group.name,
            [{name: 'user', label: 'User ERN', required: true, hint: 'The ERN, which the user list can copy.'}],
            values => this.eamService.addUserToUserGroup(group.ern, String(values['user'])),
            'User added to group',
        );
    }

    removeUser(group: UserGroup): void {
        this.addThen(
            'Remove a user from ' + group.name,
            [{name: 'user', label: 'User ERN', required: true}],
            values => this.eamService.removeUserFromUserGroup(group.ern, String(values['user'])),
            'User removed from group',
        );
    }

    deleteGroup(group: UserGroup): void {
        this.confirmThen(
            {title: 'Delete user group', message: `Delete ${group.name}? The users in it are left alone.`},
            this.eamService.deleteUserGroup(group.name),
            'User group deleted',
        );
    }

    members(group: UserGroup): string {
        const ids = group.userIds ?? [];
        return ids.length === 0 ? '-' : ids.join(', ');
    }
}

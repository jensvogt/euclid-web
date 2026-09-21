import {Component} from '@angular/core';
import type {User} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {PASSWORD_FIELDS, withMatchingPassword} from '../password/change-password';
import {EamService} from '../service/eam.service';
import {eamUserListFeature} from './state/eam-user-list.state';

/** The users, and what each of them has been granted. */
@Component({
    selector: 'eam-user-list',
    templateUrl: './eam-user-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EamUserListComponent extends EuclidListComponent<User> {

    override readonly feature: ListFeature<User> = eamUserListFeature;
    // No grants column: euclid 0.8 took `accountGrants` off the user and made a grant a thing in its own
    // right, held by a user or by a group they are in. What a user may do is no longer readable from the
    // user, and a column that listed it would have to ask `list-grants` per row.
    override readonly columns = ['userId', 'email', 'accountId', 'created', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eamService: EamService) {
        super();
    }

    /** The account and region default to the session's own, which is what the server does with them too. */
    createUser(): void {
        this.addThen(
            'Create user',
            [
                {name: 'userId', label: 'User ID', required: true},
                {name: 'password', label: 'Password', type: 'password', required: true},
                {name: 'email', label: 'Email'},
                {name: 'isAdmin', label: 'Administrator', type: 'boolean'},
            ],
            values => this.eamService.register(
                String(values['userId']),
                String(values['password']),
                String(values['email']),
                Boolean(values['isAdmin']),
            ),
            'User created',
        );
    }

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

    deleteUser(user: User): void {
        this.confirmThen(
            {title: 'Delete user', message: `Delete ${user.userId}? This cannot be undone.`},
            this.eamService.deleteUser(user.userId),
            'User deleted',
        );
    }

}

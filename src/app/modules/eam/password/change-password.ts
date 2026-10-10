import {Observable, throwError} from 'rxjs';

import {ResourceField} from '../../../shared/resource-add/resource-add.component';

/**
 * What setting a password asks for: the new one twice, and the old one when it is your own.
 *
 * Twice because it is not shown: a password field typed once and never read back is a password that is
 * wrong for as long as it takes somebody to notice they cannot log in.
 *
 * The old one only for yourself, because that is what euclid asks for. One action serves both, told
 * apart by what it carries - an administrator resetting somebody else's is not supposed to know the old
 * one, and being an administrator is the proof instead.
 */
export function passwordFields(own: boolean): ResourceField[] {
    const fields: ResourceField[] = own
        ? [{
            name: 'oldPassword',
            label: 'Current password',
            type: 'password',
            required: true,
            hint: 'Your own password changes only on proof of the old one. A token alone is not enough.',
        }]
        : [];

    return [
        ...fields,
        {name: 'password', label: 'New password', type: 'password', required: true},
        {
            name: 'repeat',
            label: 'Repeat the new password',
            type: 'password',
            required: true,
            hint: 'The two have to match.',
        },
    ];
}

/**
 * The change, or a refusal when the two fields disagree.
 *
 * A refusal rather than a thrown error, because this is called where an action is expected: it goes back
 * through the same path a server's refusal takes, so the mismatch reaches the snackbar the way everything
 * else does rather than leaving an unhandled exception behind a closed dialog.
 *
 * Shared because the user list and the user details page ask the same thing the same way - see
 * {@link import("../service/eam.service.js").EamService.changePassword}, which is where the request
 * itself lives.
 */
export function withMatchingPassword(
    values: Record<string, string | number | boolean>,
    change: (password: string) => Observable<unknown>,
): Observable<unknown> {
    const password = String(values['password']);
    if (password !== String(values['repeat'])) {
        return throwError(() => new Error('The two passwords do not match.'));
    }
    return change(password);
}

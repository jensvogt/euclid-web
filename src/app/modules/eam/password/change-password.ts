import {Observable, throwError} from 'rxjs';

import {ResourceField} from '../../../shared/resource-add/resource-add.component';

/**
 * What changing a password asks for: the current one, and the new one twice.
 *
 * The new one twice because it is not shown: a password field that is typed once and never read back is a
 * password that is wrong for as long as it takes somebody to notice they cannot log in.
 *
 * The current one because the server insists - it answers 403 "The old password is not correct" to a
 * change that does not carry it, whoever is asking. So this is a user changing their own password rather
 * than an administrator resetting one, even when it is reached from the user list.
 */
export const PASSWORD_FIELDS: ResourceField[] = [
    {
        name: 'oldPassword',
        label: 'Current password',
        type: 'password',
        required: true,
        hint: 'The password being replaced. The server checks it, so a forgotten one cannot be reset here.',
    },
    {name: 'newPassword', label: 'New password', type: 'password', required: true},
    {
        name: 'repeat',
        label: 'Repeat the new password',
        type: 'password',
        required: true,
        hint: 'The two have to match.',
    },
];

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
    change: (oldPassword: string, newPassword: string) => Observable<unknown>,
): Observable<unknown> {
    const newPassword = String(values['newPassword']);
    if (newPassword !== String(values['repeat'])) {
        return throwError(() => new Error('The two passwords do not match.'));
    }
    return change(String(values['oldPassword']), newPassword);
}

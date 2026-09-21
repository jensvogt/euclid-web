import {Observable, throwError} from 'rxjs';

import {ResourceField} from '../../../shared/resource-add/resource-add.component';

/**
 * What changing a password asks for: the new one, twice.
 *
 * Twice because it is not shown: a password field that is typed once and never read back is a password
 * that is wrong for as long as it takes somebody to notice they cannot log in.
 */
export const PASSWORD_FIELDS: ResourceField[] = [
    {name: 'password', label: 'New password', type: 'password', required: true},
    {
        name: 'repeat',
        label: 'Repeat the password',
        type: 'password',
        required: true,
        hint: 'The two have to match. The old password is not needed and is not kept.',
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
    change: (password: string) => Observable<unknown>,
): Observable<unknown> {
    const password = String(values['password']);
    if (password !== String(values['repeat'])) {
        return throwError(() => new Error('The two passwords do not match.'));
    }
    return change(password);
}

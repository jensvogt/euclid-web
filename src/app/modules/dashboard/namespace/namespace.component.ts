import {Component} from '@angular/core';
import {MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatSnackBar} from '@angular/material/snack-bar';

import {EamService} from '../../eam/service/eam.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';

/**
 * Switching the namespace the session is scoped to.
 *
 * A round trip rather than a local setting: the server validates the namespace against the current account
 * and the caller's grants, so until `change-namespace` has answered, the UI does not know whether it may
 * show the new scope. The dialog stays open on a refusal with the server's own reason on it.
 */
@Component({
    selector: 'namespace-dialog',
    templateUrl: './namespace.component.html',
    styleUrls: ['./namespace.component.scss'],
    standalone: true,
    imports: [
        FormsModule,
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatDialogClose,
        MatButton,
        MatFormField,
        MatLabel,
        MatHint,
        MatInput,
    ],
})
export class NamespaceDialog {

    namespace: string;
    busy = false;
    error = '';

    constructor(
        private readonly dialogRef: MatDialogRef<NamespaceDialog>,
        private readonly eamService: EamService,
        private readonly session: EuclidSessionService,
        private readonly snackBar: MatSnackBar,
    ) {
        this.namespace = this.session.namespace;
    }

    save(): void {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.error = '';

        this.eamService.changeNamespace(this.namespace.trim()).subscribe({
            next: () => {
                this.busy = false;
                this.snackBar.open('Namespace is now ' + (this.namespace.trim() || '(account root)'), 'Done', {duration: 5000});
                // Reloaded rather than navigated: every open list is showing another namespace's contents, and
                // there is no cheaper way to be sure none of it is left on screen.
                this.dialogRef.close(true);
                window.location.reload();
            },
            error: (error: Error) => {
                this.busy = false;
                this.error = error.message;
            },
        });
    }
}

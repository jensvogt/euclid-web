import {Component, OnInit} from '@angular/core';
import {MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatSnackBar} from '@angular/material/snack-bar';
import type {Namespace} from 'euclid-ndk';

import {EamService} from '../../eam/service/eam.service';
import {EuclidSessionService} from '../../../services/euclid-session.service';
import {Page} from '../../../services/euclid-http.service';

/** How many namespaces the picker asks for at once - the same page the login card asks for. */
const NAMESPACE_PAGE_SIZE = 500;

/**
 * Switching the namespace the session is scoped to.
 *
 * A round trip rather than a local setting: the server validates the namespace against the current account
 * and the caller's grants, so until `change-namespace` has answered, the UI does not know whether it may
 * show the new scope. The dialog stays open on a refusal with the server's own reason on it.
 *
 * The namespaces are offered rather than typed, as the login card offers them - a namespace is a name the
 * server knows and spelling one wrong is a round trip to be told so. The one the session is already in is
 * always among them, even when the listing did not mention it, so that opening this dialog can never be
 * the thing that loses somebody their scope.
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
        MatSelect,
        MatOption,
        MatProgressSpinner,
    ],
})
export class NamespaceDialog implements OnInit {

    /** What the picker is on. Empty is the account root. */
    namespace: string;

    /** The namespaces to offer, in name order. */
    namespaces: string[] = [];

    /** How many the account has, which is more than {@link namespaces} holds when they do not fit one page. */
    namespaceTotal = 0;

    /** Whether the list is still being read. The picker has nothing to offer until it is. */
    loading = true;

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

    ngOnInit(): void {
        this.loadNamespaces();
    }

    /** What the picker says under itself: the usual note, or that the account has more than fits one page. */
    get hint(): string {
        if (this.namespaceTotal > this.namespaces.length) {
            return `The first ${this.namespaces.length} of ${this.namespaceTotal}.`;
        }
        return 'The account root is a scope like any other, not "all of them".';
    }

    /**
     * Scopes the session to the chosen namespace.
     *
     * Choosing the one it is already in closes the dialog and does nothing else. With a text field that was
     * a typo worth a round trip; with a picker it is the state the dialog opens in, so it would otherwise
     * be the easiest thing in here to do - and it costs a request and a full page reload to arrive back
     * where it started.
     */
    save(): void {
        if (this.busy || this.loading) {
            return;
        }
        if (this.namespace === this.session.namespace) {
            this.dialogRef.close(false);
            return;
        }
        this.busy = true;
        this.error = '';

        this.eamService.changeNamespace(this.namespace).subscribe({
            next: () => {
                this.busy = false;
                this.snackBar.open('Namespace is now ' + (this.namespace || '(account root)'), 'Done', {duration: 5000});
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

    /**
     * The namespaces this account has.
     *
     * A failure is a note beside the picker rather than a closed dialog: the account root and whatever the
     * session is already in are still offered, so somebody who may not list an account's namespaces can
     * still get back to the root.
     */
    private loadNamespaces(): void {
        this.eamService.listNamespaces({pageSize: NAMESPACE_PAGE_SIZE}).subscribe({
            next: (page: Page<Namespace>) => {
                this.loading = false;
                this.namespaces = withCurrent(page.items.map((namespace: Namespace) => namespace.name), this.namespace);
                this.namespaceTotal = page.total;
            },
            error: (error: Error) => {
                this.loading = false;
                this.namespaces = withCurrent([], this.namespace);
                this.error = error.message;
            },
        });
    }
}

/**
 * The names to offer, with the one the session is in among them.
 *
 * Added when the listing did not mention it, which happens two ways: the account has more namespaces than
 * one page holds, or the listing was refused outright. Either way a picker that omitted the current scope
 * would show the session as being somewhere it is not, and the first thing anybody did with it would be to
 * move themselves somewhere they did not mean to go.
 */
function withCurrent(names: string[], current: string): string[] {
    const all = current && !names.includes(current) ? [...names, current] : names;
    return [...all].sort((left, right) => left.localeCompare(right));
}

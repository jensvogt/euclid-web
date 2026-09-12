import {Component, Inject} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
} from '@angular/material/dialog';
import {MatButton} from '@angular/material/button';

/** What a confirmation asks about: what is about to happen, and to what. */
export interface ConfirmData {
    title: string;
    message: string;
    confirm?: string;
}

/**
 * A yes/no before something that cannot be undone.
 *
 * Deleting in euclid is immediate and keeps nothing - `delete-table` takes every item with it, `purge-queue`
 * has no confirmation of its own - so the one chance to stop is here.
 */
@Component({
    selector: 'confirm-dialog',
    templateUrl: './confirm.component.html',
    standalone: true,
    imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
})
export class ConfirmDialog {
    constructor(@Inject(MAT_DIALOG_DATA) public readonly data: ConfirmData) {
    }
}

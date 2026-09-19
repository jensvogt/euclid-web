import {Directive, inject} from '@angular/core';
import {Location} from '@angular/common';
import {MatDialog, MatDialogConfig} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Observable} from 'rxjs';

import {ConfirmData, ConfirmDialog} from '../confirm/confirm.component';
import {ResourceAddData, ResourceAddDialog, ResourceField} from '../resource-add/resource-add.component';

/**
 * What a view that acts on euclid's resources does, whatever shape it has.
 *
 * Every such view ends an action the same way - ask if it cannot be undone, call the module service, read
 * back what is now wrong, and say what happened - and none of that depends on whether the view is a page
 * of rows or one resource. {@link import("../list/euclid-list.component.js").EuclidListComponent} is the
 * first kind and the bucket details page is the second; the part they share lives here rather than being
 * written twice with the second copy drifting.
 *
 * What a subclass owes this class is {@link load}: the one thing only it knows is what "read it again"
 * means for what it is showing.
 */
@Directive()
export abstract class EuclidResourceComponent {

    protected readonly dialog = inject(MatDialog);
    protected readonly snackBar = inject(MatSnackBar);
    protected readonly location = inject(Location);

    /** When this view last read what it shows, which is what the footer reports. */
    lastUpdate: Date = new Date();

    /** Reads again whatever this view is showing. */
    abstract load(): void;

    refresh(): void {
        this.load();
    }

    back(): void {
        this.location.back();
    }

    /**
     * Runs one action, reads back what it changed, and says what happened.
     *
     * Every mutation in these views ends the same way - what is on screen is now wrong, and the user wants
     * to know it worked - and an error has to reach the snackbar rather than only the console, because the
     * server's sentence is the only thing that says which of several things went wrong.
     *
     * `message` is a sentence, or one made from what the server answered: an action taken on in the
     * background has nothing to report except what it took on, and "Done" is the wrong word for it.
     *
     * `done` is the reload by default, and is given instead by the actions that leave the view behind:
     * deleting the resource a detail page is about makes reloading that page an error rather than a
     * refresh, so it navigates away instead.
     */
    protected run<T>(
        action: Observable<T>,
        message: string | ((result: T) => string),
        done: () => void = () => this.load(),
    ): void {
        action.subscribe({
            next: (result: T) => {
                done();
                this.snackBar.open(typeof message === 'string' ? message : message(result), 'Done', {duration: 5000});
            },
            error: (error: Error) => this.snackBar.open(error.message, 'Failed', {duration: 10000}),
        });
    }

    /** The same, behind a confirmation, for what cannot be undone. */
    protected confirmThen<T>(
        confirm: ConfirmData,
        action: Observable<T>,
        message: string | ((result: T) => string),
        done?: () => void,
    ): void {
        const dialogConfig = new MatDialogConfig();
        dialogConfig.autoFocus = true;
        dialogConfig.width = '30%';
        dialogConfig.minWidth = '320px';
        dialogConfig.data = confirm;

        this.dialog.open(ConfirmDialog, dialogConfig).afterClosed().subscribe(confirmed => {
            if (confirmed) {
                this.run(action, message, done);
            }
        });
    }

    /**
     * Asks for the fields an action takes, and hands them to `create` if the user went through with it.
     *
     * `confirm` is what the button that does it says, and is worth giving whenever the action is not a
     * creation: the dialog says "Create" otherwise, which is the wrong word for renaming something or
     * changing a value it already has.
     */
    protected addThen(
        title: string,
        fields: ResourceField[],
        create: (values: Record<string, string | number | boolean>) => Observable<unknown>,
        message: string,
        confirm?: string,
        done?: () => void,
    ): void {
        const dialogConfig = new MatDialogConfig();
        dialogConfig.disableClose = true;
        dialogConfig.autoFocus = true;
        dialogConfig.width = '32%';
        dialogConfig.minWidth = '360px';
        dialogConfig.data = {title: title, fields: fields, confirm: confirm} as ResourceAddData;

        this.dialog.open(ResourceAddDialog, dialogConfig).afterClosed()
            .subscribe((values: Record<string, string | number | boolean> | undefined) => {
                if (values) {
                    this.run(create(values), message, done);
                }
            });
    }
}

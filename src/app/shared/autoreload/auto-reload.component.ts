import {Component} from '@angular/core';
import {MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatButton} from '@angular/material/button';

/** The floor the app component also enforces: a list that reloads faster than this is a load test. */
export const MIN_AUTO_RELOAD_MS = 10000;

@Component({
    selector: 'auto-reload-component',
    templateUrl: './auto-reload.component.html',
    standalone: true,
    imports: [
        FormsModule,
        MatDialogTitle,
        MatDialogContent,
        MatFormField,
        MatLabel,
        MatInput,
        MatButton,
        MatDialogActions,
        MatDialogClose,
    ],
})
export class AutoReloadComponent {

    autoReload: number = 60;

    constructor(private readonly dialogRef: MatDialogRef<AutoReloadComponent>) {
        const stored = localStorage.getItem('autoReload');
        if (stored !== null) {
            this.autoReload = parseInt(stored, 10) / 1000;
        }
    }

    save() {
        const period = Math.max(this.autoReload * 1000, MIN_AUTO_RELOAD_MS);
        localStorage.setItem('autoReload', String(period));
        this.dialogRef.close(String(period));
    }
}

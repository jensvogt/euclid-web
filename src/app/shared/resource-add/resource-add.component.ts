import {Component, Inject} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogRef,
    MatDialogTitle,
} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {MatButton} from '@angular/material/button';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatInput} from '@angular/material/input';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatOption, MatSelect} from '@angular/material/select';

/** One thing a create dialog asks for. */
export interface ResourceField {
    name: string;
    label: string;
    type?: 'text' | 'password' | 'number' | 'boolean' | 'select';
    hint?: string;
    required?: boolean;
    options?: string[];
    value?: string | number | boolean;
}

/** What a create dialog is: a title, and the fields the action behind it takes. */
export interface ResourceAddData {
    title: string;
    fields: ResourceField[];
    confirm?: string;
}

/**
 * Creating a resource, for the nine modules whose create action is a handful of named arguments.
 *
 * One dialog driven by field descriptors rather than nine near-identical ones, because that is all the
 * difference between them: a bucket needs a name, a key a name and a description, an account an ID as
 * well. A module whose create is genuinely more than a form - an application, with its runtime, artifact
 * and scaling - gets its own dialog instead of bending this one.
 */
@Component({
    selector: 'resource-add-dialog',
    templateUrl: './resource-add.component.html',
    styleUrls: ['./resource-add.component.scss'],
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
        MatCheckbox,
        MatSelect,
        MatOption,
    ],
})
export class ResourceAddDialog {

    /** The field values, keyed by field name - which is what the dialog answers with. */
    values: Record<string, string | number | boolean> = {};

    constructor(
        private readonly dialogRef: MatDialogRef<ResourceAddDialog>,
        @Inject(MAT_DIALOG_DATA) public readonly data: ResourceAddData,
    ) {
        for (const field of data.fields) {
            this.values[field.name] = field.value ?? (field.type === 'boolean' ? false : field.type === 'number' ? 0 : '');
        }
    }

    /** Whether every required field has been filled in. */
    get valid(): boolean {
        return this.data.fields
            .filter(field => field.required)
            .every(field => String(this.values[field.name] ?? '').trim().length > 0);
    }

    save(): void {
        if (this.valid) {
            this.dialogRef.close(this.values);
        }
    }
}

import {Component, Inject, ChangeDetectionStrategy} from '@angular/core';
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

import {byteConversion} from '../byte-utils.component';

/**
 * What a field answers with.
 *
 * `File` is here because one field type cannot be typed into: a local file is picked, and what the
 * action behind the dialog is handed is the file itself rather than a path - a browser never tells a
 * page where a file came from, only what is in it.
 */
export type FieldValue = string | number | boolean | File | null;

/**
 * A field's answer as text, which is what nearly every action behind a dialog sends.
 *
 * Rather than `String(value)`, which turns a picked file into `"[object File]"` and an unpicked one into
 * `"null"` - neither of them anything a server should be handed as a name or a description. Both come
 * back empty here; a field that wants the file itself reads it as one.
 */
export function textOf(value: FieldValue | undefined): string {
    if (value === null || value === undefined || value instanceof File) {
        return '';
    }
    return String(value);
}

/** What a field starts as when it was given no value: unticked, zero, no file, or empty text. */
function emptyValueOf(type: ResourceField['type']): FieldValue {
    switch (type) {
        case 'boolean':
            return false;
        case 'number':
            return 0;
        case 'file':
            return null;
        default:
            return '';
    }
}

/** One thing a create dialog asks for. */
export interface ResourceField {
    name: string;
    label: string;
    type?: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'file';
    hint?: string;
    required?: boolean;
    options?: string[];
    /**
     * What the arrows move a number field by, and what counts as a valid value in it.
     *
     * Numbers only, and only worth giving where the field is not whole: an input left to itself steps
     * by one, which marks a CPU limit of `1.5` invalid and offers no way to reach it with the arrows.
     */
    step?: number;
    /** What the file picker offers by default, as an `accept` list: `.jar,.zip`. Files only. */
    accept?: string;
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
    changeDetection: ChangeDetectionStrategy.Eager,
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
    values: Record<string, FieldValue> = {};

    protected readonly byteConversion = byteConversion;

    constructor(
        private readonly dialogRef: MatDialogRef<ResourceAddDialog>,
        @Inject(MAT_DIALOG_DATA) public readonly data: ResourceAddData,
    ) {
        for (const field of data.fields) {
            this.values[field.name] = field.value ?? emptyValueOf(field.type);
        }
    }

    /** Whether every required field has been filled in. A file field wants a file, not a name. */
    get valid(): boolean {
        return this.data.fields
            .filter(field => field.required)
            .every(field => field.type === 'file'
                ? this.fileOf(field.name) !== null
                : textOf(this.values[field.name]).trim().length > 0);
    }

    /** The file picked for one field, or null while none has been. */
    fileOf(name: string): File | null {
        const value = this.values[name];
        return value instanceof File ? value : null;
    }

    /**
     * Takes the file the browser was asked for.
     *
     * One file: what these fields stand for is an artifact or a document, and a picker that allowed
     * several would leave the action behind the dialog to decide which of them was meant.
     */
    choose(name: string, event: Event): void {
        this.values[name] = (event.target as HTMLInputElement).files?.[0] ?? null;
    }

    save(): void {
        if (this.valid) {
            this.dialogRef.close(this.values);
        }
    }
}

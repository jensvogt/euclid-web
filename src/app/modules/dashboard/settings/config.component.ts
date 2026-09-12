import {Component} from '@angular/core';
import {MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle} from '@angular/material/dialog';
import {MatButton} from '@angular/material/button';
import {MatList, MatListItem} from '@angular/material/list';

import {environment} from '../../../../environments/environment';
import {EUCLID_MODULES} from '../../../shared/metrics/euclid-modules';

/** What this is, what it talks to, and which modules it covers. */
@Component({
    selector: 'about-dialog',
    templateUrl: './config.component.html',
    styleUrls: ['./config.component.scss'],
    standalone: true,
    imports: [
        MatDialogTitle,
        MatDialogContent,
        MatDialogActions,
        MatDialogClose,
        MatButton,
        MatList,
        MatListItem,
    ],
})
export class AboutDialog {
    readonly environment = environment;
    readonly modules = EUCLID_MODULES;
}

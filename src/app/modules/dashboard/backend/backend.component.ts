import {Component} from '@angular/core';
import {MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle} from '@angular/material/dialog';
import {MatButton} from '@angular/material/button';
import {MatList, MatListItem} from '@angular/material/list';

import {environment} from '../../../../environments/environment';
import {EuclidSessionService} from '../../../services/euclid-session.service';

/**
 * Where the gateway is, and what identity this UI is talking to it as.
 *
 * Read-only, unlike awsmock-ui's equivalent, and that is the consequence of the architecture rather than an
 * omission: every euclid call carries `x-euclid-*` headers, and the gateway's CORS allows only
 * `Content-Type`, `Authorization` and `X-Requested-With` - so a cross-origin backend typed in here would
 * have its preflight refused. The endpoint is a same-origin path, and what stands behind it is
 * `proxy.conf.json` in development or nginx in a container. Pointing this UI at another server means
 * changing that, not a field here.
 */
@Component({
    selector: 'backend-dialog',
    templateUrl: './backend.component.html',
    styleUrls: ['./backend.component.scss'],
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
export class BackendDialog {

    readonly endpoint = environment.euclidEndpoint;
    readonly configuration = environment.name;

    constructor(readonly session: EuclidSessionService) {
    }
}

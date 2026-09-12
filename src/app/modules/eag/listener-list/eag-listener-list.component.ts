import {Component} from '@angular/core';
import type {Listener} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {eagListenerListFeature} from './state/eag-listener-list.state';

/**
 * The ports the gateway is listening on, one per configured namespace.
 *
 * Read-only, because a listener is configuration rather than a resource: it comes from the installation's
 * `euclid.json` and changes with a restart, not with a call. What is worth seeing here is which of them are
 * actually serving, and whether the certificate each presents has expired.
 */
@Component({
    selector: 'eag-listener-list',
    templateUrl: './eag-listener-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EagListenerListComponent extends EuclidListComponent<Listener> {

    override readonly feature: ListFeature<Listener> = eagListenerListFeature;
    override readonly columns = ['namespace', 'port', 'protocol', 'serving', 'certificateName', 'expires'];

    protected readonly dateConversion = dateConversion;

    /** Whether the certificate a listener presents has already expired. */
    expired(listener: Listener): boolean {
        return listener.certificate?.expired === true;
    }
}

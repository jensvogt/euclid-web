import {Component} from '@angular/core';
import type {Certificate} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EkmService} from '../service/ekm.service';
import {ekmCertificateListFeature} from './state/ekm-certificate-list.state';

/** The stored certificates. The PEM is here; the private key never leaves the server. */
@Component({
    selector: 'ekm-certificate-list',
    templateUrl: './ekm-certificate-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EkmCertificateListComponent extends EuclidListComponent<Certificate> {

    override readonly feature: ListFeature<Certificate> = ekmCertificateListFeature;
    override readonly columns = ['name', 'subject', 'issuer', 'notAfter', 'generated', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly ekmService: EkmService) {
        super();
    }

    /**
     * Deleting a certificate needs no grace period.
     *
     * Nothing becomes unreadable - a certificate is public - and a listener already serving it keeps the copy
     * it loaded until it restarts. Which is what makes this recoverable: import a replacement under the same
     * name.
     */
    deleteCertificate(certificate: Certificate): void {
        this.confirmThen(
            {
                title: 'Delete certificate',
                message: `Delete ${certificate.name}? A listener already serving it keeps its copy until it restarts, so importing a replacement under the same name undoes this.`,
            },
            this.ekmService.deleteCertificate(certificate.name),
            'Certificate deleted',
        );
    }

    /** Whether a certificate has already expired, which is what the list is ordered to surface. */
    expired(certificate: Certificate): boolean {
        return !!certificate.notAfter && new Date(certificate.notAfter).getTime() < Date.now();
    }
}

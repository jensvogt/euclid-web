import {Component, Input} from '@angular/core';
import {DatePipe} from '@angular/common';

import {environment} from '../../../environments/environment';
import {EuclidSessionService} from '../../services/euclid-session.service';

@Component({
    selector: 'footer-component',
    templateUrl: './footer.component.html',
    styleUrls: ['./footer.component.scss'],
    imports: [DatePipe],
    standalone: true,
})
export class FooterComponent {
    @Input() lastUpdate: Date | undefined;

    endpoint: string = environment.euclidEndpoint;

    constructor(private readonly session: EuclidSessionService) {
    }

    /** The scope the figures above were read under, which is what makes them mean anything. */
    get scope(): string {
        const session = this.session.session;
        if (session === null) {
            return 'not logged in';
        }
        return session.userId + '@' + session.accountId + (session.namespace ? '/' + session.namespace : '');
    }
}

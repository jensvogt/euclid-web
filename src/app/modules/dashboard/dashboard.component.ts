import {Component, OnDestroy, OnInit} from '@angular/core';
import {interval, Subscription} from 'rxjs';

import {EuclidSessionService} from '../../services/euclid-session.service';
import {autoReloadPeriod} from '../../shared/list/euclid-list.component';
import {EUCLID_MODULES} from '../../shared/metrics/euclid-modules';

@Component({
    selector: 'dashboard-component',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: false,
})
export class DashboardComponent implements OnInit, OnDestroy {

    lastUpdate: Date = new Date();

    /** The modules this installation has, which is what the monitoring card lists. */
    readonly modules = EUCLID_MODULES;

    private updateSubscription: Subscription | undefined;

    constructor(readonly session: EuclidSessionService) {
    }

    ngOnInit(): void {
        this.lastUpdate = new Date();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => {
            this.lastUpdate = new Date();
        });
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }
}

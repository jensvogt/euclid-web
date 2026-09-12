import {Component, ContentChild, Input, OnInit, TemplateRef} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {AsyncPipe, NgTemplateOutlet} from '@angular/common';
import {Observable, tap} from 'rxjs';
import {RouteConfigLoadEnd, RouteConfigLoadStart, Router} from '@angular/router';

import {LoadingService} from './loading-service.component';

@Component({
    selector: 'loading-indicator',
    templateUrl: './loading-spinner.component.html',
    styleUrls: ['./loading-spinner.component.scss'],
    imports: [MatProgressSpinnerModule, AsyncPipe, NgTemplateOutlet],
    standalone: true,
})
export class LoadingIndicatorComponent implements OnInit {

    loading$: Observable<boolean>;

    @Input() detectRouteTransitions = true;

    @ContentChild('loading') customLoadingIndicator: TemplateRef<any> | null = null;

    constructor(private readonly loadingService: LoadingService, private readonly router: Router) {
        this.loading$ = this.loadingService.loading$;
    }

    ngOnInit() {
        if (this.detectRouteTransitions) {
            this.router.events
                .pipe(
                    tap((event) => {
                        if (event instanceof RouteConfigLoadStart) {
                            this.loadingService.loadingOn();
                        } else if (event instanceof RouteConfigLoadEnd) {
                            this.loadingService.loadingOff();
                        }
                    }),
                )
                .subscribe();
        }
    }
}

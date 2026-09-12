import {Injectable} from '@angular/core';
import {HttpContextToken, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest} from '@angular/common/http';
import {debounceTime, finalize, Observable} from 'rxjs';

import {LoadingService} from './loading-service.component';

export const SkipLoading = new HttpContextToken<boolean>(() => false);

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {

    constructor(private readonly loadingService: LoadingService) {
    }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        // An auto-reload that flashed the spinner every period would make the page unreadable, so a
        // request may opt out - see SkipLoading.
        if (request.context.get(SkipLoading)) {
            return next.handle(request);
        }

        this.loadingService.loadingOn();
        return next.handle(request)
            .pipe(
                debounceTime(1000),
                finalize(() => {
                    this.loadingService.loadingOff();
                }),
            );
    }
}

import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Listener, Route} from 'euclid-ndk';

import {EuclidHttpService, Page} from '../../../services/euclid-http.service';

export const TARGET = 'eag';

/** How a route authenticates the requests it carries. */
export const ROUTE_AUTH_NONE = 'NONE';
export const ROUTE_AUTH_EUCLID = 'EUCLID';
export const ROUTE_AUTH_BASIC = 'BASIC';
export const ROUTE_AUTHENTICATION = [ROUTE_AUTH_NONE, ROUTE_AUTH_EUCLID, ROUTE_AUTH_BASIC];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** EAG - euclid's API gateway: the paths it publishes and the ports it serves them on. */
@Injectable({providedIn: 'root'})
export class EagService {

    constructor(private readonly http: EuclidHttpService) {
    }

    // -- routes --------------------------------------------------------------------------------

    /**
     * The routes whose path starts with a prefix, as a page.
     *
     * EAG answers with every match at once, so the paging is local - see
     * {@link import('../../eap/service/eap.service').EapService.listApplications}, which is in the same
     * position. The listing is the session's own account and namespace: it shows what the session can then
     * address, rather than everything the gateway serves.
     */
    listRoutes(prefix = '', pageSize = 10, pageIndex = 0, sortColumn = 'path', sortDirection: 'asc' | 'desc' = 'asc'): Observable<Page<Route>> {
        return this.http.all<Route>(TARGET, 'list-routes', 'routes', {prefix: prefix}).pipe(
            map((items: Route[]) => {
                const sorted = [...items].sort((left, right) => {
                    const a = (left as unknown as Record<string, unknown>)[sortColumn];
                    const b = (right as unknown as Record<string, unknown>)[sortColumn];
                    return String(a ?? '').localeCompare(String(b ?? ''));
                });
                if (sortDirection === 'desc') {
                    sorted.reverse();
                }
                return {
                    total: items.length,
                    items: sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
                };
            }),
        );
    }

    getRoute(routeId: string): Observable<Route> {
        return this.http.call<Route>(TARGET, 'get-route', {routeId: routeId});
    }

    /**
     * Publishes a path that reaches an application.
     *
     * A route names either an application or a module action, never both and never neither - the server
     * refuses the other two combinations, so the dialogs offer one or the other rather than a form that can
     * be filled in wrongly.
     */
    createRoute(routeId: string, path: string, applicationId: string, methods: string[], authentication = ROUTE_AUTH_NONE): Observable<unknown> {
        return this.http.call(TARGET, 'create-route', {
            routeId: routeId,
            path: path,
            applicationId: applicationId,
            methods: methods,
            authentication: authentication,
            active: true,
        });
    }

    /** Publishes a path that reaches one action of a euclid module rather than an application. */
    createModuleRoute(routeId: string, path: string, moduleTarget: string, moduleAction: string, methods: string[], authentication = ROUTE_AUTH_NONE): Observable<unknown> {
        return this.http.call(TARGET, 'create-route', {
            routeId: routeId,
            path: path,
            moduleTarget: moduleTarget,
            moduleAction: moduleAction,
            methods: methods,
            authentication: authentication,
            active: true,
        });
    }

    /**
     * Takes a route out of service, or puts it back.
     *
     * How something stops being exposed in a hurry: the route stays exactly as it was and comes back the same,
     * which deleting and recreating it would not guarantee.
     */
    setRouteActive(routeId: string, active: boolean): Observable<unknown> {
        return this.http.call(TARGET, 'update-route', {routeId: routeId, active: active});
    }

    /** Deletes a route, which stops the gateway serving its path. */
    deleteRoute(routeId: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-route', {routeId: routeId});
    }

    // -- listeners -----------------------------------------------------------------------------

    /** The ports the gateway is listening on, and the certificate each is serving. */
    listListeners(): Observable<Page<Listener>> {
        return this.http.page<Listener>(TARGET, 'list-listeners', 'listeners');
    }
}

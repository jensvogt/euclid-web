import {Component} from '@angular/core';
import type {Route} from 'euclid-ndk';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {EagService, HTTP_METHODS, ROUTE_AUTHENTICATION, ROUTE_AUTH_NONE} from '../service/eag.service';
import {eagRouteListFeature} from './state/eag-route-list.state';

/** The paths the gateway publishes, and what each of them reaches. */
@Component({
    selector: 'eag-route-list',
    templateUrl: './eag-route-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EagRouteListComponent extends EuclidListComponent<Route> {

    override readonly feature: ListFeature<Route> = eagRouteListFeature;
    override readonly columns = ['path', 'target', 'methods', 'authentication', 'active', 'modified', 'actions'];

    protected readonly dateConversion = dateConversion;

    constructor(private readonly eagService: EagService) {
        super();
    }

    /**
     * Publishes a path that reaches an application.
     *
     * A separate dialog from {@link createModuleRoute} rather than one form with both fields, because the
     * server refuses a route that names both an application and a module action, and refuses one that names
     * neither. Two dialogs cannot be filled in wrongly.
     */
    createRoute(): void {
        this.addThen(
            'Publish a route to an application',
            [
                {name: 'routeId', label: 'Route ID', required: true},
                {name: 'path', label: 'Path', required: true, hint: 'Matched on whole segments, so /api/v1.0 does not match /api/v1X0.'},
                {name: 'applicationId', label: 'Application ID', required: true},
                {name: 'methods', label: 'Methods', hint: 'Comma separated, e.g. ' + HTTP_METHODS.join(',') + '. Empty allows all.'},
                {name: 'authentication', label: 'Authentication', type: 'select', options: ROUTE_AUTHENTICATION, value: ROUTE_AUTH_NONE},
            ],
            values => this.eagService.createRoute(
                String(values['routeId']),
                String(values['path']),
                String(values['applicationId']),
                methodsOf(String(values['methods'])),
                String(values['authentication']),
            ),
            'Route published',
        );
    }

    /** Publishes a path that reaches one action of a euclid module. The pair is required, not optional. */
    createModuleRoute(): void {
        this.addThen(
            'Publish a route to a module action',
            [
                {name: 'routeId', label: 'Route ID', required: true},
                {name: 'path', label: 'Path', required: true},
                {name: 'moduleTarget', label: 'Module', required: true, hint: 'eqs, esm, ens...'},
                {name: 'moduleAction', label: 'Action', required: true, hint: 'A target with no action answers 400 for every request.'},
                {name: 'methods', label: 'Methods', hint: 'Comma separated. Empty allows all.'},
                {name: 'authentication', label: 'Authentication', type: 'select', options: ROUTE_AUTHENTICATION, value: ROUTE_AUTH_NONE},
            ],
            values => this.eagService.createModuleRoute(
                String(values['routeId']),
                String(values['path']),
                String(values['moduleTarget']),
                String(values['moduleAction']),
                methodsOf(String(values['methods'])),
                String(values['authentication']),
            ),
            'Module route published',
        );
    }

    /**
     * Takes a route out of service, or puts it back.
     *
     * How something stops being exposed in a hurry: the route stays as it was and comes back the same, which
     * deleting and recreating it would not guarantee.
     */
    toggleActive(route: Route): void {
        this.run(
            this.eagService.setRouteActive(route.routeId, !route.active),
            route.active ? 'Route deactivated' : 'Route activated',
        );
    }

    deleteRoute(route: Route): void {
        this.confirmThen(
            {
                title: 'Delete route',
                message: `Delete ${route.routeId}? The gateway stops serving ${route.path}. To take it out of service temporarily, deactivate it instead.`,
            },
            this.eagService.deleteRoute(route.routeId),
            'Route deleted',
        );
    }

    /** What a route reaches: an application, or one action of a module. Never both. */
    target(route: Route): string {
        if (route.applicationId) {
            return route.applicationId;
        }
        return route.moduleTarget ? route.moduleTarget + ':' + route.moduleAction : '-';
    }
}

/** A comma-separated list of methods, with the blanks dropped. Empty means the route allows all of them. */
function methodsOf(input: string): string[] {
    return input.split(',').map(method => method.trim().toUpperCase()).filter(method => method.length > 0);
}

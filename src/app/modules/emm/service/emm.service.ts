import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import type {Module} from 'euclid-ndk';

import {EuclidHttpService} from '../../../services/euclid-http.service';

export const TARGET = 'emm';

/**
 * EMM - euclid's module registry: what the manager is running, and where.
 *
 * The shapes come from euclid-ndk as type-only imports, as every other module's do: euclid 0.18 wraps
 * EMM, so what this file declared by hand until then is now the SDK's to keep in step with the server.
 */
@Injectable({providedIn: 'root'})
export class EmmService {

    constructor(private readonly http: EuclidHttpService) {
    }

    /**
     * Every module the manager knows, each with its instances.
     *
     * One answer for the installation rather than one per module: the instances come with it, which is
     * what lets a page about one application find its own without a second request.
     */
    listModules(): Observable<Module[]> {
        return this.http.all<Module>(TARGET, 'list-modules', 'modules');
    }

    /**
     * Which host each instance of one module is on, keyed by instance.
     *
     * By the module's *runtime name*, not an application ID. A module name is installation-wide and an
     * application ID is not - it is unique only within an account and namespace - so matching on the ID
     * would find nothing for an application deployed since EAP started issuing runtime names, and the
     * wrong namespace's pool for one deployed before.
     */
    hostsOf(runtimeName: string): Observable<Record<string, string>> {
        return this.listModules().pipe(
            map((modules: Module[]) => {
                const module = modules.find((candidate: Module) => candidate.name === runtimeName);
                const hosts: Record<string, string> = {};
                for (const instance of module?.instances ?? []) {
                    hosts[instance.instanceId] = instance.host ?? '';
                }
                return hosts;
            }),
        );
    }
}

import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {catchError, map, Observable, throwError} from 'rxjs';

import {environment} from '../../environments/environment';
import {EuclidSessionService} from './euclid-session.service';

/** How a listing is paged and ordered. Every field has a server-side default. */
export interface PageQuery {
    pageSize?: number;
    pageIndex?: number;
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
}

/** How a listing is paged, ordered and narrowed. Most listings take a prefix; message pages do not. */
export interface ListQuery extends PageQuery {
    prefix?: string;
}

/** Every listing answers with a page: `total` is how many exist, the items are the page. */
export interface Page<T> {
    total: number;
    items: T[];
}

/**
 * One euclid module request, in the shape the gateway expects.
 *
 * euclid speaks one request shape, which is why this is one method rather than one per module: POST JSON
 * to the gateway root, name the module in `x-euclid-target` and the operation in `x-euclid-action`, and
 * read the JSON back. A module service on top of this spells out its own actions and the shapes they
 * answer with - exactly what euclid-ndk's `ModuleClient` does for node.
 *
 * The endpoint is a same-origin path (see `environment.euclidEndpoint`), so nothing here is subject to a
 * CORS preflight over the `x-euclid-*` headers - which the gateway would refuse.
 */
@Injectable({providedIn: 'root'})
export class EuclidHttpService {

    private readonly url: string = environment.euclidEndpoint + '/';

    constructor(private readonly http: HttpClient, private readonly session: EuclidSessionService) {
    }

    /**
     * Sends one action of one module.
     *
     * Deliberately not narrowed to the actions this UI knows: a server that gains an action is reachable
     * without a release here, which is the same bargain euclid-ndk's `ModuleClient.call` strikes.
     */
    call<T>(target: string, action: string, payload: Record<string, unknown> = {}): Observable<T> {
        return this.http.post<T>(this.url, payload, {headers: this.session.requestHeaders(target, action)}).pipe(
            catchError((error: HttpErrorResponse) => throwError(() => euclidError(target, action, error))),
        );
    }

    /**
     * A listing, as a page.
     *
     * `field` is what the module calls its items - `queues`, `buckets`, `topics` - because euclid names
     * the array after the thing in it rather than calling every one of them `items`. Flattening that
     * here is what lets one list component serve every module.
     */
    page<T>(target: string, action: string, field: string, payload: Record<string, unknown> = {}): Observable<Page<T>> {
        return this.call<Record<string, unknown>>(target, action, payload).pipe(
            map((response: Record<string, unknown>) => {
                const items = response[field];
                return {
                    total: typeof response['total'] === 'number' ? response['total'] as number : 0,
                    items: Array.isArray(items) ? items as T[] : [],
                };
            }),
        );
    }

    /**
     * A listing that is not paged, for the modules that answer with every match at once.
     *
     * EAP and EAG do that deliberately - an installation has tens of applications and routes rather than
     * thousands - so the page a list view needs is made here rather than asked of the server.
     */
    all<T>(target: string, action: string, field: string, payload: Record<string, unknown> = {}): Observable<T[]> {
        return this.call<Record<string, unknown>>(target, action, payload).pipe(
            map((response: Record<string, unknown>) => {
                const items = response[field];
                return Array.isArray(items) ? items as T[] : [];
            }),
        );
    }
}

/** A listing's paging and ordering, with the server's own defaults filled in where the caller said nothing. */
export function pagePayload(query: PageQuery, defaultSortColumn: string): Record<string, unknown> {
    return {
        pageSize: query.pageSize ?? 10,
        pageIndex: query.pageIndex ?? 0,
        sortColumn: query.sortColumn ?? defaultSortColumn,
        sortDirection: query.sortDirection ?? 'asc',
    };
}

/** The same, for the listings that also narrow by prefix. */
export function listPayload(query: ListQuery, defaultSortColumn: string): Record<string, unknown> {
    return {prefix: query.prefix ?? '', ...pagePayload(query, defaultSortColumn)};
}

/**
 * The server's own reason for refusing, rather than Angular's description of the status code.
 *
 * euclid answers a refusal with `{"error": "..."}`, and that sentence is the only thing that says which
 * of the several things that can go wrong actually did - so it is what reaches the snackbar.
 */
function euclidError(target: string, action: string, error: HttpErrorResponse): Error {
    const reason = typeof error.error?.error === 'string' ? error.error.error : error.message;
    return new Error(`${target}:${action} failed (${error.status}): ${reason}`);
}

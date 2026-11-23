import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';

import {EuclidHttpService, ListQuery, listPayload, Page} from '../../../services/euclid-http.service';

export const TARGET = 'eds';

/**
 * The record types EDS writes, in the order a zone is usually filled in.
 *
 * What `Dns::TypeFromString` takes, and no more: a type this list does not name is one the server
 * refuses, so offering it would be offering a refusal.
 */
export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SRV', 'TXT'];

/** What a zone falls back to for records that name no TTL, and for negative answers. */
export const DEFAULT_TTL = 300;

/** The owner name that means the zone's apex, which is what a zone-file writes as `@`. */
export const APEX = '@';

/**
 * One hosted zone: an apex, and what it answers for.
 *
 * Declared here rather than imported, because euclid-ndk does not wrap EDS yet. The shape is
 * `EdsServer::describeZone()`, which is what both the listing and `get-zone` answer with.
 *
 * `serial` is the zone's modification time in seconds, which is what a secondary would compare: it
 * moves when anything in the zone changes, and it is not a counter anybody sets.
 */
export interface HostedZone {
    name: string;
    ern: string;
    namespace: string;
    ttl: number;
    description: string;
    recordCount: number;
    serial: number;
    created: string;
    modified: string;
}

/**
 * One record set: every value answered for one owner name and type.
 *
 * A set rather than a record, which is why writing one replaces what was there: DNS answers a question
 * with all of the values at once, and "add one A record" is not a thing the protocol has.
 */
export interface ResourceRecord {
    zone: string;
    name: string;
    type: string;
    ttl: number;
    values: string[];
    created: string;
    modified: string;
}

/** One record of an answer, which is flatter than a stored set: a value rather than the values. */
export interface AnswerRecord {
    name: string;
    type: string;
    ttl: number;
    value: string;
}

/**
 * What the name server would answer, asked without going near a socket.
 *
 * `authoritative` is false for a name outside every zone this installation hosts, which the server
 * answers REFUSED rather than guessing at - it is not a resolver for the internet. An authoritative
 * answer names the zone it came out of, and that zone need not be one `list-zones` showed: EDS also
 * synthesizes a zone for the service domain, so a node's or an application's name answers without
 * anybody having stored a record for it.
 *
 * `authority` is what the answer carries instead of records when there are none - the zone's SOA,
 * which is how NXDOMAIN and "exists, but not of this type" are told apart.
 */
export interface DnsAnswer {
    name: string;
    type: string;
    authoritative: boolean;
    rcode: string;
    zone?: string;
    answers: AnswerRecord[];
    authority?: AnswerRecord[];
}

/**
 * EDS - euclid's domain name service: the zones this installation answers for.
 *
 * A zone is an apex and the records under it, and the module is both a store and a name server: what
 * is written here is what its listener answers on port 53. So the thing to check after an edit is not
 * that the row is there but that the answer changed, which is what `get-answer` is for - see
 * {@link getAnswer}.
 *
 * Declared by hand rather than imported, as the lifecycle rules are: euclid-ndk wraps twelve modules
 * and EDS is not yet one of them. The shapes follow `EdsServer`'s own `describeZone`/`describeRecord`.
 */
@Injectable({providedIn: 'root'})
export class EdsService {

    constructor(private readonly http: EuclidHttpService) {
    }

    // -- zones ---------------------------------------------------------------------------------

    /**
     * The zones whose apex starts with a prefix, as a page.
     *
     * No match type and no sort: `list-zones` takes a prefix and a page and nothing else, and the
     * repository orders by name. A prefix is also the only narrowing that means much for a name, which
     * is read from its apex leftwards. The extra fields `listPayload` sends are ignored by the module,
     * so the view does not offer a sort it cannot deliver - see the zone list's columns.
     */
    listZones(query: ListQuery): Observable<Page<HostedZone>> {
        return this.http.page<HostedZone>(TARGET, 'list-zones', 'zones', listPayload(query, 'name'));
    }

    getZone(name: string): Observable<HostedZone> {
        return this.http.call<HostedZone>(TARGET, 'get-zone', {name: name});
    }

    /**
     * Creates a zone.
     *
     * The apex is given as a name - `example.com` - and a trailing dot is accepted and dropped, so
     * whichever form somebody pastes in is the form that works. A TTL of zero takes the module's own
     * default rather than meaning "do not cache".
     */
    createZone(name: string, ttl = 0, description = ''): Observable<HostedZone> {
        return this.http.call<HostedZone>(TARGET, 'create-zone', {name: name, ttl: ttl, description: description});
    }

    /** Deletes a zone and the records in it. The name server stops answering for it. */
    deleteZone(name: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-zone', {name: name});
    }

    // -- records -------------------------------------------------------------------------------

    /** One zone's record sets, narrowed to an owner name or a type when either is given. */
    listRecords(zone: string, name = '', type = '', pageSize = 0, pageIndex = 0): Observable<Page<ResourceRecord>> {
        return this.http.page<ResourceRecord>(TARGET, 'list-records', 'records', {
            zone: zone,
            name: name,
            type: type,
            pageSize: pageSize,
            pageIndex: pageIndex,
        });
    }

    /**
     * Writes a record set, replacing the one of the same name and type.
     *
     * Replacing rather than adding, because a set is what DNS answers with: every value for this name
     * and type travels in one answer, so changing one of them is writing all of them. The owner name
     * may be relative (`www`), fully qualified, `@` for the apex, or a wildcard (`*.dev`).
     */
    putRecord(zone: string, name: string, type: string, values: string[], ttl = 0): Observable<ResourceRecord> {
        return this.http.call<ResourceRecord>(TARGET, 'put-record', {
            zone: zone,
            name: name,
            type: type,
            ttl: ttl,
            values: values,
        });
    }

    /** Removes one set, which is every value answered for that name and type. */
    deleteRecord(zone: string, name: string, type: string): Observable<unknown> {
        return this.http.call(TARGET, 'delete-record', {zone: zone, name: name, type: type});
    }

    // -- asking --------------------------------------------------------------------------------

    /**
     * What the name server would answer, without asking it over the wire.
     *
     * The check worth making after an edit: a record set is stored, but what a client gets is the
     * resolver's answer to a question - which a CNAME, a wildcard or a zone that does not quite cover
     * the name can make a different thing. An empty type means A.
     */
    getAnswer(name: string, type = ''): Observable<DnsAnswer> {
        return this.http.call<DnsAnswer>(TARGET, 'get-answer', {name: name, type: type}).pipe(
            map((answer: DnsAnswer) => ({
                ...answer,
                answers: answer.answers ?? [],
                authority: answer.authority ?? [],
            })),
        );
    }
}

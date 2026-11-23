import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {CdkCopyToClipboard} from '@angular/cdk/clipboard';
import {MatIconButton} from '@angular/material/button';
import {MatCard, MatCardContent, MatCardHeader} from '@angular/material/card';
import {MatDivider} from '@angular/material/divider';
import {MatIcon} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltip} from '@angular/material/tooltip';
import {Store} from '@ngrx/store';
import {interval, Observable, Subscription} from 'rxjs';

import {dateConversion} from '../../../shared/date-utils.component';
import {FooterComponent} from '../../../shared/footer/footer.component';
import {autoReloadPeriod} from '../../../shared/list/euclid-list.component';
import {EuclidResourceComponent} from '../../../shared/resource/euclid-resource.component';
import {
    APEX,
    DnsAnswer,
    EdsService,
    HostedZone,
    RECORD_TYPES,
    ResourceRecord,
} from '../service/eds.service';
import {edsZoneDetailsActions, edsZoneDetailsSelectors} from './state/eds-zone-details.state';

/** How several values of one set are written in a dialog, and read back out of it. */
const VALUE_SEPARATOR = ',';

/**
 * One zone: what it answers for, and what it would answer.
 *
 * The records are the page, and they are sets rather than records - every value for one owner name and
 * type travels in one answer, so writing one value is writing all of them. That is why the row's edit
 * button opens the whole set and why `put-record` replaces rather than appends.
 *
 * The second tab is the one worth knowing about. A stored set is not an answer: a CNAME redirects the
 * question, a wildcard covers names nobody wrote down, and the synthesized service zone answers for
 * nodes and applications that have no stored records at all. `get-answer` asks the resolver the
 * question a client would ask, without a client - so after an edit, it says whether the edit did what
 * was meant rather than whether the row went in.
 */
@Component({
    selector: 'eds-zone-details',
    templateUrl: './eds-zone-details.component.html',
    styleUrls: ['../../../shared/resource/details.component.scss'],
    standalone: true,
    imports: [
        MatCard,
        MatCardHeader,
        MatCardContent,
        MatIconButton,
        MatIcon,
        MatTooltip,
        MatMenuModule,
        MatDivider,
        MatTableModule,
        MatTabsModule,
        CdkCopyToClipboard,
        RouterLink,
        AsyncPipe,
        FooterComponent,
    ],
})
export class EdsZoneDetailsComponent extends EuclidResourceComponent implements OnInit, OnDestroy {

    zone$!: Observable<HostedZone | null>;
    error$!: Observable<string | null>;

    /** The zone this page is about, by apex - which is what every EDS zone action takes. */
    name = '';

    /**
     * The zone's record sets, read beside the zone rather than with it.
     *
     * `list-records` is its own action, and the whole zone is asked for in one go: a zone is tens of
     * sets, not thousands, and a resolver has to hold all of them anyway. Held as an array because
     * `mat-table` takes its rows by reference.
     */
    records: ResourceRecord[] = [];
    readonly recordColumns = ['name', 'type', 'ttl', 'values', 'modified', 'actions'];

    /** The last question put to the resolver, and what it answered. Nothing until somebody asks. */
    answer: DnsAnswer | null = null;
    answerError = '';
    readonly answerColumns = ['name', 'type', 'ttl', 'value'];

    protected readonly dateConversion = dateConversion;
    protected readonly apex = APEX;

    private readonly store = inject(Store);
    private readonly route = inject(ActivatedRoute);
    private readonly edsService = inject(EdsService);

    private updateSubscription: Subscription | undefined;

    ngOnInit(): void {
        this.name = this.route.snapshot.paramMap.get('name') ?? '';
        this.zone$ = this.store.select(edsZoneDetailsSelectors.selectZone);
        this.error$ = this.store.select(edsZoneDetailsSelectors.selectError);
        this.load();
        this.updateSubscription = interval(autoReloadPeriod()).subscribe(() => this.load());
    }

    ngOnDestroy(): void {
        this.updateSubscription?.unsubscribe();
    }

    override load(): void {
        if (!this.name) {
            return;
        }
        this.lastUpdate = new Date();
        this.store.dispatch(edsZoneDetailsActions.load({name: this.name}));
        this.loadRecords();
    }

    /**
     * Reads the record sets.
     *
     * Quietly on a failure, as the bucket page reads its rules: this runs on every reload, and a zone
     * whose records cannot be read is still a zone worth seeing the heading of.
     */
    private loadRecords(): void {
        this.edsService.listRecords(this.name).subscribe({
            next: page => this.records = page.items,
            error: () => this.records = [],
        });
    }

    // -- how a set reads -----------------------------------------------------------------------------

    /**
     * The owner name as a zone file would write it: `@` for the apex, and relative otherwise.
     *
     * EDS stores names fully qualified, so every row would otherwise end in the zone and the one thing
     * that distinguishes them would be the part nobody is reading. The full name is still in the
     * tooltip, because that is what `get-answer` and a client both take.
     */
    owner(record: ResourceRecord): string {
        if (record.name === this.name) {
            return APEX;
        }
        const suffix = `.${this.name}`;
        return record.name.endsWith(suffix) ? record.name.slice(0, -suffix.length) : record.name;
    }

    /** The values of a set, one line each - a set of four A records is four addresses, not one string. */
    values(record: ResourceRecord): string[] {
        return record.values ?? [];
    }

    /** What a set falls back to when it names no TTL of its own, which is the zone's. */
    effectiveTtl(record: ResourceRecord, zone: HostedZone): number {
        return record.ttl > 0 ? record.ttl : zone.ttl;
    }

    // -- writing a set -------------------------------------------------------------------------------

    /**
     * Writes a set, adding one or replacing the one a row is about.
     *
     * One method for both, because `put-record` is one call either way: it takes every value for the
     * name and type and replaces what was there. So editing offers the name and type fixed - changing
     * either would write a second set and leave the first one answering - while adding asks for them.
     */
    putRecord(zone: HostedZone, record?: ResourceRecord): void {
        this.addThen(
            record ? `${this.owner(record)} ${record.type}` : 'Add a record to ' + zone.name,
            [
                ...(record ? [] : [
                    {
                        name: 'name',
                        label: 'Name',
                        value: APEX,
                        hint: `Relative to the zone - "www" is www.${zone.name}. "${APEX}" is the apex itself,`
                            + ' a name ending in a dot is taken as written, and "*" is a wildcard.',
                    },
                    {
                        name: 'type',
                        label: 'Type',
                        type: 'select' as const,
                        required: true,
                        options: RECORD_TYPES,
                        value: 'A',
                    },
                ]),
                {
                    name: 'values',
                    label: 'Values',
                    required: true,
                    value: record ? this.values(record).join(`${VALUE_SEPARATOR} `) : '',
                    hint: 'Every value this name and type answers with, separated by commas. All of them:'
                        + ' a set is replaced rather than added to, because one answer carries all of it.',
                },
                {
                    name: 'ttl',
                    label: 'TTL (seconds)',
                    type: 'number',
                    value: record?.ttl ?? 0,
                    hint: `How long a resolver may cache it. Zero takes the zone's own ${zone.ttl}s.`,
                },
            ],
            values => this.edsService.putRecord(
                zone.name,
                record ? record.name : String(values['name'] ?? APEX).trim(),
                record ? record.type : String(values['type']),
                String(values['values'])
                    .split(VALUE_SEPARATOR)
                    .map(value => value.trim())
                    .filter(value => value.length > 0),
                Number(values['ttl']) || 0,
            ),
            record ? 'Record saved' : 'Record added',
            record ? 'Save' : 'Add',
        );
    }

    /**
     * Removes one set.
     *
     * Worth confirming, because what goes is not a row but an answer: between this and the resolver's
     * caches expiring, the name stops resolving for whoever is using it.
     */
    deleteRecord(zone: HostedZone, record: ResourceRecord): void {
        this.confirmThen(
            {
                title: 'Delete record',
                message: `Delete the ${record.type} record set for ${record.name}?`
                    + ` ${this.values(record).length} value(s) stop being answered, and a resolver that has`
                    + ' the old answer keeps it until its TTL runs out.',
            },
            this.edsService.deleteRecord(zone.name, record.name, record.type),
            'Record deleted',
        );
    }

    /**
     * Deletes the zone and leaves for the list.
     *
     * The whole zone: the name server answers for this apex now, and afterwards it answers for nothing
     * under it, which is a different thing from one record being wrong.
     */
    deleteZone(zone: HostedZone): void {
        this.confirmThen(
            {
                title: 'Delete zone',
                message: `Delete ${zone.name} and its ${zone.recordCount} record sets?`
                    + ' The name server stops answering for the whole zone. This cannot be undone.',
            },
            this.edsService.deleteZone(zone.name),
            'Zone deleted',
            () => void this.router.navigate(['/eds-zone-list']),
        );
    }

    // -- asking the resolver -------------------------------------------------------------------------

    /**
     * Puts a question to the resolver and shows what came back.
     *
     * Asked rather than sent: `get-answer` resolves inside the module, so this is what a client on port
     * 53 would be told without one having to be installed. The answer is held on the component rather
     * than run through {@link run}, because nothing was changed and "Done" would be the wrong word.
     */
    askAnswer(zone: HostedZone): void {
        this.askThen(
            'What would it answer?',
            [
                {
                    name: 'name',
                    label: 'Name',
                    required: true,
                    value: zone.name,
                    hint: 'The name a client would ask for. Any name, not only one in this zone -'
                        + ' a name outside every hosted zone is answered REFUSED, which is also an answer.',
                },
                {
                    name: 'type',
                    label: 'Type',
                    type: 'select',
                    required: true,
                    options: RECORD_TYPES,
                    value: 'A',
                },
            ],
            'Ask',
            values => {
                this.answer = null;
                this.answerError = '';
                this.edsService.getAnswer(String(values['name']).trim(), String(values['type'])).subscribe({
                    next: (answer: DnsAnswer) => this.answer = answer,
                    error: (error: Error) => this.answerError = error.message,
                });
            },
        );
    }

    /** What an rcode means, since a name that exists with no record of that type is not an error. */
    rcodeNote(answer: DnsAnswer): string {
        if (!answer.authoritative) {
            return 'Outside every zone this installation hosts. The DNS port would forward it or refuse it.';
        }
        switch (answer.rcode) {
            case 'NOERROR':
                return answer.answers.length > 0
                    ? 'Answered.'
                    : 'The name exists in this zone, but not with this type. The zone\'s SOA goes in the'
                        + ' authority section instead, which is what tells a resolver how long to remember that.';
            case 'NXDOMAIN':
                return 'No such name in this zone - a different answer from "the name exists, but not with this'
                    + ' type", and the SOA below says how long a resolver may remember it.';
            default:
                return 'The zone could not answer.';
        }
    }
}

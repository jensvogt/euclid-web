import {Component} from '@angular/core';

import {dateConversion} from '../../../shared/date-utils.component';
import {EuclidListComponent} from '../../../shared/list/euclid-list.component';
import {EUCLID_LIST_IMPORTS} from '../../../shared/list/list-imports';
import {ListFeature} from '../../../shared/list/list-feature';
import {DEFAULT_TTL, EdsService, HostedZone} from '../service/eds.service';
import {edsZoneListFeature} from './state/eds-zone-list.state';

/**
 * The zones this installation answers for.
 *
 * A zone is an apex and the records under it, and EDS is both the store and the name server - so a
 * zone listed here is a name its listener answers on port 53, not a row waiting to be published.
 */
@Component({
    selector: 'eds-zone-list',
    templateUrl: './eds-zone-list.component.html',
    styleUrls: ['../../../shared/list/list.component.scss'],
    standalone: true,
    imports: [EUCLID_LIST_IMPORTS],
})
export class EdsZoneListComponent extends EuclidListComponent<HostedZone> {

    override readonly feature: ListFeature<HostedZone> = edsZoneListFeature;
    override readonly columns = ['name', 'records', 'ttl', 'description', 'created', 'actions'];

    /**
     * No match type and no sortable header, because `list-zones` reads neither.
     *
     * It takes a prefix and a page, and the repository orders by name - so a match combo would change
     * nothing and a clicked header would reorder nothing while looking as though it had. A zone list is
     * short enough that neither is missed.
     */
    override readonly matchTypes = false;

    protected readonly dateConversion = dateConversion;

    constructor(private readonly edsService: EdsService) {
        super();
    }

    /**
     * Creates a zone.
     *
     * The apex is a name rather than an ERN, and a trailing dot is dropped for whoever pastes one in.
     * The TTL is the zone's own default, which a record falls back to and a negative answer is held
     * under - zero means the module's default rather than "do not cache".
     */
    createZone(): void {
        this.addThen(
            'Create zone',
            [
                {
                    name: 'name',
                    label: 'Apex',
                    required: true,
                    hint: 'The zone\'s name, as in example.com. A trailing dot is accepted and dropped.',
                },
                {
                    name: 'ttl',
                    label: 'Default TTL (seconds)',
                    type: 'number',
                    value: DEFAULT_TTL,
                    hint: 'What a record with no TTL of its own is answered with, and how long a "no such name" is kept.',
                },
                {name: 'description', label: 'Description'},
            ],
            values => this.edsService.createZone(
                String(values['name']).trim(),
                Number(values['ttl']) || 0,
                String(values['description'] ?? ''),
            ),
            'Zone created',
        );
    }

    /**
     * Deletes a zone and everything in it.
     *
     * Worth spelling out what stops: the name server answers for this zone now, and after this it
     * answers for nothing under that apex - which is a different thing from a record being wrong.
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
        );
    }
}

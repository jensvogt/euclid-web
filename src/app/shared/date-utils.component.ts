import {DatePipe} from '@angular/common';

/**
 * One of euclid's timestamps, rendered.
 *
 * euclid answers with ISO-8601 strings rather than BSON dates, and an absent timestamp with the empty
 * string - a dash rather than "Invalid Date" is what a table wants for that.
 */
export function dateConversion(timestamp: string | undefined | null): string {
    if (!timestamp) {
        return '-';
    }
    return new DatePipe('en-GB').transform(timestamp, 'dd-MM-yyyy HH:mm:ss') ?? '-';
}

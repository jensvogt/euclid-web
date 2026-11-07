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

/**
 * The clock time of one of euclid's timestamps, for a chart's axis.
 *
 * The same 24-hour clock {@link dateConversion} renders - `en-GB`, so 15:55 rather than 3:55 PM. The
 * browser's own locale is not the right default here: a chart reads beside tables that are already in
 * this format, and an axis that switches to a 12-hour clock on somebody else's machine makes the two
 * disagree about the same moment.
 *
 * Seconds are left out: the points these label are minutes apart, and the seconds are always zero.
 */
export function timeConversion(timestamp: string | number | Date | undefined | null): string {
    if (timestamp === null || timestamp === undefined || timestamp === '') {
        return '-';
    }
    return new DatePipe('en-GB').transform(timestamp, 'HH:mm') ?? '-';
}

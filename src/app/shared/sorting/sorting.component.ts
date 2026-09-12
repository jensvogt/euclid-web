/**
 * How a listing is ordered.
 *
 * One column rather than awsmock-ui's array of them, because that is what euclid takes: every paged
 * action reads a single `sortColumn` and a `sortDirection` of `asc` or `desc`.
 */
export interface SortColumn {
    column: string;
    direction: 'asc' | 'desc';
}

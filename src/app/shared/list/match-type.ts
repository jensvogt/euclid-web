/**
 * How a list's search text is matched against a name.
 *
 * The wire names euclid's own `Database::MatchType` parses, and the four euclid-rui offers. An absent
 * or empty one is `prefix`, which is what every list action did before the field existed - so a server
 * that has never heard of this answers a search the way it always did rather than refusing it.
 *
 * Every type but `regex` is matched literally: the server quotes the text before it reaches the
 * database, so a search for `a.b` does not also find `aXb`.
 */
export type MatchType = 'prefix' | 'endsWith' | 'contains' | 'regex';

/** The four, in the order the picker offers them, with what to call each one. */
export const MATCH_TYPES: {value: MatchType; label: string}[] = [
    {value: 'prefix', label: 'Starts with'},
    {value: 'endsWith', label: 'Ends with'},
    {value: 'contains', label: 'Contains'},
    {value: 'regex', label: 'Regex'},
];

/**
 * What a list view has to offer for its search box to take a match type.
 *
 * A narrow interface rather than the component itself: `EuclidListComponent<T>` carries actions that
 * take a `Page<T>`, which makes a list of one thing unassignable to a list of another, and the search
 * box has no interest in what is being listed.
 */
export interface ListSearch {
    prefixValue: string;
    prefixSet: boolean;
    matchTypeValue: MatchType;
    /** Whether this listing's action takes a match type at all - see the box's own comment. */
    matchTypes: boolean;
    setPrefix(): void;
    unsetPrefix(): void;
    setMatchType(type: MatchType): void;
}

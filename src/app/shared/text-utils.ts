/**
 * Any value as text, for the places that read euclid's raw answers rather than typed ones.
 *
 * Rather than `String(value)`: a field typed `unknown` may hold an object, and `String()` of that is
 * `[object Object]` - which reaches the screen, or a sort, looking like data. An object comes out as JSON
 * instead, so at least what it held is visible. Missing comes out empty, as `String(value ?? '')` did.
 */
export function textFrom(value: unknown): string {
    switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
        case 'bigint':
            return value.toString();
        case 'undefined':
            return '';
        case 'object':
            return value === null ? '' : JSON.stringify(value);
        default:
            // A function or a symbol: nothing euclid sends, and nothing worth showing.
            return '';
    }
}

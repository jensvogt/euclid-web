/**
 * Laying out a message body so it can be read, when it is a format that has a layout.
 *
 * A body arrives as whatever was sent, which for machine-to-machine traffic is usually one long line. JSON
 * and XML both have a canonical indented form, so those two are worth offering; anything else - a CSV, a
 * log line, a base64 blob - has no such form, and inventing one would be changing the message rather than
 * presenting it.
 */

/** How deep one level of nesting is drawn, in spaces. What `JSON.stringify` is asked for as well. */
const INDENT = '  ';

/**
 * The body laid out, or null when it is not a format this knows how to lay out.
 *
 * Null rather than the input unchanged, so that the caller can tell "there was nothing to do" from "it was
 * already tidy" and say so. Every failure lands here: a body that looked like JSON and would not parse is
 * left alone in exactly the same way as one that never looked like JSON at all, because a half-formatted
 * document is worse than the original.
 */
export function prettyPrint(body: string): string | null {
    const trimmed = (body ?? '').trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return prettyJson(trimmed);
    }
    if (trimmed.startsWith('<')) {
        return prettyXml(trimmed);
    }
    return null;
}

/**
 * JSON, indented.
 *
 * Only an object or an array reaches this: `JSON.parse` accepts `17` and `"a"` as well, and re-emitting
 * those achieves nothing while claiming to have done something.
 */
function prettyJson(json: string): string | null {
    try {
        return JSON.stringify(JSON.parse(json), null, INDENT.length);
    } catch {
        return null;
    }
}

/**
 * XML, indented.
 *
 * Parsed rather than pattern-matched, so that the layout follows the document's actual structure - and so
 * that something which merely starts with `<` is refused rather than mangled. `DOMParser` reports a
 * malformed document by handing back one whose content is a `parsererror` element, which is the only way
 * it says so: it throws nothing.
 *
 * The declaration is carried over by hand because it is not in the tree - `<?xml ... ?>` is the document's
 * own preamble rather than a processing instruction, so a parsed document has no node for it, and dropping
 * it would quietly change what the body says about its encoding.
 */
function prettyXml(xml: string): string | null {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length > 0 || !parsed.documentElement) {
        return null;
    }
    const declaration = /^<\?xml[^?]*\?>/.exec(xml);
    const lines: string[] = declaration ? [declaration[0]] : [];
    writeElement(parsed.documentElement, 0, lines);
    return lines.join('\n');
}

/**
 * One element and everything under it, as indented lines.
 *
 * An element holding nothing but text stays on one line - `<id>17</id>` split over three is harder to read
 * than the original, not easier. Only an element with element children is opened out.
 */
function writeElement(element: Element, depth: number, lines: string[]): void {
    const padding = INDENT.repeat(depth);
    const open = element.tagName + attributesOf(element);
    const children = Array.from(element.childNodes).filter(node => !isIgnorable(node));

    if (children.length === 0) {
        lines.push(`${padding}<${open}/>`);
        return;
    }
    if (children.every(node => node.nodeType !== Node.ELEMENT_NODE)) {
        lines.push(`${padding}<${open}>${children.map(textOf).join('')}</${element.tagName}>`);
        return;
    }

    lines.push(`${padding}<${open}>`);
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
            writeElement(child as Element, depth + 1, lines);
        } else {
            lines.push(INDENT.repeat(depth + 1) + textOf(child));
        }
    }
    lines.push(`${padding}</${element.tagName}>`);
}

/** An element's attributes, in the order the document had them, with their values escaped. */
function attributesOf(element: Element): string {
    return Array.from(element.attributes)
        .map(attribute => ` ${attribute.name}="${escapeText(attribute.value).replace(/"/g, '&quot;')}"`)
        .join('');
}

/**
 * Whitespace that is only there to lay the document out, which this is about to do again.
 *
 * Only between elements: whitespace inside an element that holds text is part of the text, and dropping it
 * would change what the message says.
 */
function isIgnorable(node: ChildNode): boolean {
    return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() === '';
}

/** A non-element child as it should be written back out: text escaped, comments and CDATA as they were. */
function textOf(node: ChildNode): string {
    if (node.nodeType === Node.COMMENT_NODE) {
        return `<!--${node.textContent ?? ''}-->`;
    }
    if (node.nodeType === Node.CDATA_SECTION_NODE) {
        return `<![CDATA[${node.textContent ?? ''}]]>`;
    }
    return escapeText((node.textContent ?? '').trim());
}

/** The three characters that cannot appear in XML text as themselves. */
function escapeText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

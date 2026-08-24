
import { AlignmentType, Indent, Paragraph, TextRun, UnderlineType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LineRuleType, TableLayoutType } from "docx";
import { convertToSmartQuotes } from "./docx-helpers";
import { listRegime } from "./list-regimes";

// Smart (curly) quotation marks used to wrap a quoted block on export.
const SMART_OPEN_QUOTE = '“';  // "
const SMART_CLOSE_QUOTE = '”'; // "

// Set once per export in parseHtml from drafto-settings. When true, quoted
// (blockquote) blocks are forced to single line spacing; the space after the
// last paragraph of each block is then set so the visual gap to the following
// normal text equals the gap between two normal paragraphs (see
// computeQuoteAfterTwips). Otherwise quotes inherit the document's default spacing.
let exportQuoteSingleSpacing = false;
// Geometry of the enclosing numbered list, so a quote inside a list indents
// RELATIVE to that list instead of the page margin. Text indent of list level L
// is (base + L*step); a quote sits 0.25" further in. Defaults to the SLP/HC list
// geometry and is reset on every parseHtml call, so it never leaks between
// documents. The CAT OA passes its own (wider) geometry.
export interface ListGeom { base: number; step: number }
const DEFAULT_LIST_GEOM: ListGeom = { base: 360, step: 360 };
let quoteListGeom: ListGeom = DEFAULT_LIST_GEOM;
// Output formatting (mirrors Settings → Customize → Output Text Formatting), read
// at export time so the blockquote trailing space tracks the user's choices.
let exportOutputFontSizePt = 14;
let exportOutputLineSpacing = 1.5;
let exportOutputParaAfterPt = 12;

// Trailing space (twips) for the last paragraph of a single-spaced blockquote so
// that the visual gap to the next normal paragraph matches a normal-to-normal gap.
// A normal (L-spaced) paragraph carries extra leading of (L-1)×singleLineHeight
// below its last line; a single-spaced line has none, so we add that back on top
// of the normal after-paragraph spacing. singleLineHeight ≈ 1.15×fontSize.
function computeQuoteAfterTwips(): number {
    const afterTwips = exportOutputParaAfterPt * 20;          // 1pt = 20 twips
    const singleLineTwips = exportOutputFontSizePt * 20 * 1.15;
    const extraLeading = Math.max(0, exportOutputLineSpacing - 1) * singleLineTwips;
    return Math.round(afterTwips + extraLeading);
}

// A simple representation of a DOM node
interface SimpleNode {
    tagName: string;
    attributes: { [key: string]: string };
    children: (SimpleNode | string)[];
}

interface ParseResult {
    paragraphs: (Paragraph | Table)[];
    numbering: any[];
}

interface ParagraphSpacing {
    before?: number;
    after?: number;
    line?: number;
}

// Decode HTML entities to their actual characters
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

// HTML void elements: they never have a closing tag, so the parser must not push
// them onto the open-tag stack (doing so misaligns every subsequent close tag).
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// Cell margins (a.k.a. cell padding) for exported table cells, matching MS Word's
// default for a table inserted directly in Word: 0.08" (115 twips) left/right and
// none top/bottom. Without this the docx library leaves cells with no inset, so
// text sits flush against the borders — tighter than a Word-made table.
const WORD_DEFAULT_CELL_MARGINS = { top: 0, bottom: 0, left: 115, right: 115 };

// Approximate pixel width of the BadhiyaBox editor content area. Used only to
// reconstruct how much room a *fluid* (undragged) table column occupies relative
// to columns the user dragged to an explicit px width — the editor lays the table
// out at this width, so a fluid column shows (width − sized columns) of space.
const EDITOR_CONTENT_PX = 620;

// Process-wide seed for <ol> numbering references, so every parsed list gets a
// reference unique across ALL parseHtml calls (see the note in parseHtml).
let olRefSeed = 0;

// Basic HTML parser to create a tree structure
function htmlToTree(html: string): (SimpleNode | string)[] {
    const stack: SimpleNode[] = [];
    const root: SimpleNode = { tagName: 'root', attributes: {}, children: [] };
    stack.push(root);

    const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
        const text = decodeHtmlEntities(html.substring(lastIndex, match.index));
        if (text) {
            stack[stack.length - 1].children.push(text);
        }

        const [fullMatch, isClosing, tagName, attrsStr] = match;
        const attributes: { [key: string]: string } = {};
        if (attrsStr) {
            attrsStr.trim().replace(/([a-zA-Z-]+)="([^"]*)"/g, (_, key, value) => {
                attributes[key] = value;
                return '';
            });
        }

        if (isClosing) {
            if (stack.length > 1) {
                stack.pop();
            }
        } else {
            const newNode: SimpleNode = { tagName: tagName.toLowerCase(), attributes, children: [] };
            stack[stack.length - 1].children.push(newNode);
            // Void (self-closing) elements have no closing tag, so they must not be
            // pushed onto the stack. TipTap tables emit <colgroup><col>…</colgroup>;
            // an unclosed <col> previously corrupted the stack so the matching
            // </table> popped a <col> instead of the table, burying — and dropping —
            // every block that followed the table (e.g. text after a table in a box).
            if (!VOID_ELEMENTS.has(newNode.tagName)) {
                stack.push(newNode);
            }
        }
        lastIndex = tagRegex.lastIndex;
    }

    const remainingText = decodeHtmlEntities(html.substring(lastIndex));
    if (remainingText) {
        stack[stack.length - 1].children.push(remainingText);
    }

    return root.children;
}

// Process the tree to create docx paragraphs and numbering configs
function treeToDocx(nodes: (SimpleNode | string)[], olCounterRef: { value: number }, listLevel = 0, inBlockquote = false, olRef?: string, spacing?: ParagraphSpacing, defaultNumbering?: { reference: string; level: number }, exportHighlight = false): ParseResult {
    const result: ParseResult = { paragraphs: [], numbering: [] };

    // Buffer consecutive inline/string nodes so that loose inline content — e.g.
    // AI-proposed HTML that isn't wrapped in <p> — renders as ONE paragraph with
    // proper bold/italic runs, instead of one broken paragraph per fragment.
    // (Well-formed TipTap/toolbar content is all <p>/<ul>/… at this level, so the
    // buffer stays empty and behaviour is unchanged.)
    const INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'mark', 'span', 'a', 'sub', 'sup', 'code', 'br']);
    let inlineBuffer: (SimpleNode | string)[] = [];

    // True when the LAST emitted block is a table. A non-empty paragraph pushed
    // directly against a table hugs the bottom border in Word, so it gets 12pt
    // space-before for visual separation. A blank line the user left after the
    // table emits an empty paragraph first, which consumes the adjacency — the
    // rule then deliberately does nothing.
    const lastIsTable = () => result.paragraphs.length > 0 && result.paragraphs[result.paragraphs.length - 1] instanceof Table;
    const TABLE_GAP_BEFORE_TWIPS = 240; // 12pt

    const flushInline = () => {
        const plain = extractPlainText(inlineBuffer);
        if (!plain.trim()) { inlineBuffer = []; return; }
        const followsTable = lastIsTable();
        const converted = convertToSmartQuotes(plain);
        const runs = processInline(inlineBuffer, {}, converted, 0, exportHighlight).runs;
        const props: any = {
            children: runs.length ? runs : [new TextRun("")],
            style: "Normal",
            alignment: AlignmentType.JUSTIFIED,
        };
        if (inBlockquote) props.indent = { left: 720, right: 720 };
        if (spacing) props.spacing = spacing;
        if (followsTable) props.spacing = { ...(props.spacing ?? {}), before: TABLE_GAP_BEFORE_TWIPS };
        if (defaultNumbering) props.numbering = defaultNumbering;
        result.paragraphs.push(new Paragraph(props));
        inlineBuffer = [];
    };

    nodes.forEach(node => {
        if (typeof node === 'string') { inlineBuffer.push(node); return; }
        if (node.tagName && INLINE_TAGS.has(node.tagName)) { inlineBuffer.push(node); return; }

        // A block-level node ends the current inline run.
        flushInline();

        const currentInBlockquote = inBlockquote || node.tagName === 'blockquote';
        let currentOlRef = olRef;

        switch (node.tagName) {
            case 'table': {
                // Build docx Table from <table> subtree
                const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
                const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideH: cellBorder, insideV: cellBorder };

                // Collect all <tr> nodes (may be inside <tbody>/<thead>)
                const collectTr = (ns: (SimpleNode | string)[]): SimpleNode[] => {
                    const rows: SimpleNode[] = [];
                    ns.forEach(n => {
                        if (typeof n === 'string') return;
                        if (n.tagName === 'tr') rows.push(n);
                        else rows.push(...collectTr(n.children));
                    });
                    return rows;
                };

                // Per-column widths from the TipTap-emitted <colgroup>. A column the
                // user actually dragged is serialized as `<col style="width:Npx">`; an
                // untouched (fluid) column is `<col style="min-width:25px">` (the
                // cellMinWidth placeholder, NOT a real width). We must read ONLY the
                // real `width:` — matching `min-width` too made fluid columns collapse
                // to 25px in the export. Returns the px width, or null when fluid.
                const parseColWidths = (ns: (SimpleNode | string)[]): (number | null)[] => {
                    const cols: (number | null)[] = [];
                    const visit = (arr: (SimpleNode | string)[]) => {
                        arr.forEach(n => {
                            if (typeof n === 'string') return;
                            if (n.tagName === 'col') {
                                const style = n.attributes.style || '';
                                // `width:` not preceded by `-` (so `min-width:` is excluded).
                                const m = style.match(/(?<!-)\bwidth:\s*([\d.]+)px/);
                                const attr = parseFloat(n.attributes.width || '');
                                cols.push(m ? parseFloat(m[1]) : (isFinite(attr) ? attr : null));
                            } else if (n.tagName === 'colgroup') {
                                visit(n.children);
                            }
                        });
                    };
                    visit(ns);
                    return cols;
                };

                // Measured column ratios stamped by the editor (data-ratio on each
                // <col>): the column's rendered width ÷ the table's rendered width,
                // captured at serialization time (see annotateTableColRatios in
                // badhiya-box.tsx). When every column carries one, these ARE the
                // ground truth for proportions — the px/content heuristics below are
                // only the fallback for older saves and AI-written HTML.
                const parseColRatios = (ns: (SimpleNode | string)[]): (number | null)[] => {
                    const out: (number | null)[] = [];
                    const visit = (arr: (SimpleNode | string)[]) => {
                        arr.forEach(n => {
                            if (typeof n === 'string') return;
                            if (n.tagName === 'col') {
                                const r = parseFloat(n.attributes['data-ratio'] || '');
                                out.push(isFinite(r) && r > 0 ? r : null);
                            } else if (n.tagName === 'colgroup') {
                                visit(n.children);
                            }
                        });
                    };
                    visit(ns);
                    return out;
                };

                const longestWord = (t: string): number =>
                    t.split(/\s+/).reduce((mx, w) => Math.max(mx, w.length), 0);

                const trNodes = collectTr(node.children);

                // Per-row cell metadata: the node, its colspan, text length and longest
                // single word (the last two drive content-proportional column sizing).
                const rowsData = trNodes.map(trNode =>
                    trNode.children
                        .filter((c): c is SimpleNode => typeof c !== 'string' && (c.tagName === 'td' || c.tagName === 'th'))
                        .map(cellNode => {
                            const span = Math.max(1, parseInt(cellNode.attributes.colspan || '1', 10) || 1);
                            const rowSpan = Math.max(1, parseInt(cellNode.attributes.rowspan || '1', 10) || 1);
                            const text = extractPlainText(cellNode.children).trim();
                            return { cellNode, span, rowSpan, textLen: text.length, word: longestWord(text) };
                        })
                );

                // Column count = widest row (summing colspans).
                const columnCount = rowsData.reduce(
                    (mx, cells) => Math.max(mx, cells.reduce((s, c) => s + c.span, 0)), 0,
                );

                // Per-column weight. If the user has dragged any column to an explicit
                // width, honour those px and let the remaining (fluid) columns split
                // the leftover of the editor's content width — mirroring how the editor
                // renders them (sized columns keep their px; fluid ones fill the rest).
                // Otherwise size each column by its heaviest content (longest of cell
                // text / longest word) so the busiest column is widest and words never
                // break mid-word.
                const manualCols = parseColWidths(node.children);
                const ratioCols = parseColRatios(node.children);
                const weights = new Array(columnCount).fill(0);
                const sizedCount = manualCols.filter((w): w is number => w != null).length;
                if (ratioCols.length === columnCount && ratioCols.every((r): r is number => r != null)) {
                    // Editor-measured ratios: reproduce the exact on-screen
                    // proportions at the docx table width.
                    for (let i = 0; i < columnCount; i++) weights[i] = ratioCols[i] as number;
                } else if (manualCols.length === columnCount && sizedCount > 0) {
                    const sumSized = manualCols.reduce((s, w) => s + (w ?? 0), 0);
                    const numFluid = columnCount - sizedCount;
                    // Reference editor content width (≈ BadhiyaBox width). Fluid columns
                    // share whatever px is left after the sized columns take their share.
                    const remaining = Math.max(0, EDITOR_CONTENT_PX - sumSized);
                    // The true editor width isn't serialized, and in wider editors (the
                    // WP workspace panels) the dragged columns can exceed the 620px
                    // reference — the old formula then collapsed every fluid column to a
                    // 40px sliver (one character wide in the export). When the leftover
                    // per fluid column is implausibly small the reference is clearly
                    // wrong: give each fluid column the average dragged width instead,
                    // which is roughly how an undragged column reads next to its sized
                    // siblings. Faithful behavior is kept whenever the leftover is real.
                    const MIN_FLUID_PX = 60;
                    const avgSized = sumSized / Math.max(1, sizedCount);
                    const fluidEach = numFluid > 0
                        ? (remaining / numFluid >= MIN_FLUID_PX
                            ? remaining / numFluid
                            : Math.max(MIN_FLUID_PX, avgSized))
                        : 0;
                    for (let i = 0; i < columnCount; i++) weights[i] = manualCols[i] ?? fluidEach;
                } else {
                    rowsData.forEach(cells => {
                        let col = 0;
                        cells.forEach(c => {
                            const share = Math.max(c.textLen, c.word) / c.span;
                            for (let k = 0; k < c.span && col + k < columnCount; k++) {
                                weights[col + k] = Math.max(weights[col + k], share);
                            }
                            col += c.span;
                        });
                    });
                }

                // Normalise to dxa widths summing to a conservative usable width that
                // fits inside the page margins on both A4 and Letter. A fixed layout
                // makes Word honour these exact proportions instead of auto-fitting.
                const TABLE_TOTAL_TWIPS = 8200;
                const sumW = weights.reduce((s, w) => s + w, 0);
                const colWidths: number[] = (columnCount === 0 || sumW === 0)
                    ? new Array(Math.max(1, columnCount)).fill(
                        columnCount > 0 ? Math.floor(TABLE_TOTAL_TWIPS / columnCount) : TABLE_TOTAL_TWIPS)
                    : weights.map(w => Math.max(360, Math.round((w / sumW) * TABLE_TOTAL_TWIPS)));

                const tableRows = rowsData.map(cells => {
                    let col = 0;
                    const docxCells = cells.map(c => {
                        const cellResult = treeToDocx(c.cellNode.children, olCounterRef, 0, false, undefined, spacing, undefined, exportHighlight);
                        result.numbering.push(...cellResult.numbering);
                        // Ensure at least one paragraph in the cell
                        const cellChildren = cellResult.paragraphs.length > 0
                            ? cellResult.paragraphs
                            : [new Paragraph('')];
                        let widthDxa = 0;
                        for (let k = 0; k < c.span && col + k < colWidths.length; k++) widthDxa += colWidths[col + k];
                        col += c.span;
                        return new TableCell({
                            children: cellChildren as any,
                            borders: allBorders,
                            margins: WORD_DEFAULT_CELL_MARGINS,
                            width: { size: widthDxa || Math.round(TABLE_TOTAL_TWIPS / Math.max(1, columnCount)), type: WidthType.DXA },
                            ...(c.span > 1 ? { columnSpan: c.span } : {}),
                            ...(c.rowSpan > 1 ? { rowSpan: c.rowSpan } : {}),
                        });
                    });
                    return new TableRow({ children: docxCells });
                });

                if (tableRows.length > 0) {
                    result.paragraphs.push(new Table({
                        rows: tableRows,
                        width: { size: TABLE_TOTAL_TWIPS, type: WidthType.DXA },
                        layout: TableLayoutType.FIXED,
                        columnWidths: colWidths,
                    }));
                }
                break;
            }
            case 'p':
                let alignment: AlignmentType = AlignmentType.JUSTIFIED;
                if (node.attributes.style?.includes('text-align: center')) alignment = AlignmentType.CENTER;
                if (node.attributes.style?.includes('text-align: right')) alignment = AlignmentType.RIGHT;
                if (node.attributes.style?.includes('text-align: left')) alignment = AlignmentType.LEFT;
                
                // Extract plain text, convert quotes, then process with formatting
                const plainText = extractPlainText(node.children);
                const convertedText = convertToSmartQuotes(plainText);
                
                const paragraphProps: any = {
                    children: processInline(node.children, {}, convertedText, 0, exportHighlight).runs,
                    alignment: alignment,
                    style: "Normal",
                };
                if (currentInBlockquote) {
                    paragraphProps.indent = { left: 720, right: 720 };
                }
                if (spacing) {
                    paragraphProps.spacing = spacing;
                }
                // 12pt space-before when non-whitespace text sits directly against
                // the preceding table (an intervening blank <p> suppresses this).
                if (plainText.trim() && lastIsTable()) {
                    paragraphProps.spacing = { ...(paragraphProps.spacing ?? {}), before: TABLE_GAP_BEFORE_TWIPS };
                }
                if (defaultNumbering && !paragraphProps.numbering) {
                    paragraphProps.numbering = defaultNumbering;
                }
                result.paragraphs.push(new Paragraph(paragraphProps));
                break;
            case 'blockquote': {
                // A quoted block is rendered as: the entire block wrapped in a
                // single pair of smart quotes, fully italicised, with an optional
                // forced single line spacing (+18pt after the last paragraph).
                // TipTap emits <blockquote><p>…</p><p>…</p></blockquote>; each <p>
                // becomes one paragraph. Fall back to treating the blockquote's
                // own children as a single paragraph if there are no <p> wrappers.
                const quotePNodes = node.children.filter(
                    (c): c is SimpleNode => typeof c !== 'string' && c.tagName === 'p'
                );
                const blockChildSets: (SimpleNode | string)[][] =
                    quotePNodes.length > 0 ? quotePNodes.map(p => p.children) : [node.children];

                // Don't double up quotes the user already typed at a boundary.
                // Strict check on the trimmed first/last char of the whole block.
                // Both straight and curly forms count (typed vs. pasted), and a
                // single quote at a boundary is treated as sufficient too.
                const blockFullText = blockChildSets.map(cs => extractPlainText(cs)).join('').trim();
                const leadingQuoteChars = ['"', '“', "'", '‘'];   // " " ' '
                const trailingQuoteChars = ['"', '”', "'", '’'];  // " " ' '
                const singleQuoteChars = ["'", '‘', '’'];          // ' ' '
                const firstChar = blockFullText[0];
                const lastChar = blockFullText[blockFullText.length - 1];
                const hasLeadingQuote = blockFullText.length > 0 && leadingQuoteChars.includes(firstChar);
                const hasTrailingQuote = blockFullText.length > 0 && trailingQuoteChars.includes(lastChar);

                // Default to a smart double-quote pair. But if the user has quoted
                // exactly one end with a single quote, match that style on the
                // auto-added end (single open ‘ / single close ’) rather than mixing
                // a single with a double.
                let wrapOpen = SMART_OPEN_QUOTE;
                let wrapClose = SMART_CLOSE_QUOTE;
                if (hasLeadingQuote && !hasTrailingQuote && singleQuoteChars.includes(firstChar)) {
                    wrapClose = '’';
                } else if (hasTrailingQuote && !hasLeadingQuote && singleQuoteChars.includes(lastChar)) {
                    wrapOpen = '‘';
                }

                // Left indent is additive: standalone quote = 0.5"; a quote inside a
                // list = the current sub-level's indent + 0.25". Right is always a
                // fixed 0.5". A quote is never numbered and never bears a list marker —
                // it sits between/under list items, it is not one of them.
                // A block can be "inside a list" in two ways: a real <ol>/<ul>
                // wrapper (listLevel > 0), or a numbering reference injected by
                // the caller (defaultNumbering) — which is how Grounds/Facts
                // items are numbered, each parsed on its own with no wrapper.
                // Both must indent the quote relative to that list.
                const effectiveListLevel = listLevel > 0
                    ? listLevel
                    : (defaultNumbering ? defaultNumbering.level + 1 : 0);
                const quoteLeftIndent = effectiveListLevel > 0
                    ? (quoteListGeom.base + effectiveListLevel * quoteListGeom.step + 360)
                    : 720;

                blockChildSets.forEach((childSet, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === blockChildSets.length - 1;

                    // Preserve per-paragraph alignment from the <p> if present.
                    let quoteAlignment: AlignmentType = AlignmentType.JUSTIFIED;
                    const styleStr = quotePNodes[idx]?.attributes.style || '';
                    if (styleStr.includes('text-align: center')) quoteAlignment = AlignmentType.CENTER;
                    if (styleStr.includes('text-align: right')) quoteAlignment = AlignmentType.RIGHT;
                    if (styleStr.includes('text-align: left')) quoteAlignment = AlignmentType.LEFT;

                    const quotePlainText = extractPlainText(childSet);
                    const quoteConvertedText = convertToSmartQuotes(quotePlainText);
                    // Force italics on every run by seeding the inline style.
                    const runs = processInline(childSet, { italics: true }, quoteConvertedText, 0, exportHighlight).runs;

                    // Wrap the whole block (not each paragraph) in one pair of smart
                    // quotes, skipping an end the user already quoted. An empty block
                    // has neither boundary quote, so it correctly emits a bare "".
                    if (isFirst && !hasLeadingQuote) runs.unshift(new TextRun({ text: wrapOpen, italics: true }));
                    if (isLast && !hasTrailingQuote) runs.push(new TextRun({ text: wrapClose, italics: true }));

                    const quoteParaProps: any = {
                        children: runs.length > 0 ? runs : [new TextRun({ text: '', italics: true })],
                        alignment: quoteAlignment,
                        style: "Normal",
                        indent: { left: quoteLeftIndent, right: 720 },
                    };

                    if (exportQuoteSingleSpacing) {
                        quoteParaProps.spacing = { line: 240, lineRule: LineRuleType.AUTO };
                        // Last paragraph: trailing space matched to a normal-to-normal gap,
                        // derived from the user's font size, line spacing and after-spacing.
                        if (isLast) quoteParaProps.spacing = { ...quoteParaProps.spacing, after: computeQuoteAfterTwips() };
                    } else if (spacing) {
                        quoteParaProps.spacing = spacing;
                    }

                    result.paragraphs.push(new Paragraph(quoteParaProps));
                });
                break;
            }
            case 'ul':
                const ulResult = treeToDocx(node.children, olCounterRef, listLevel + 1, currentInBlockquote, undefined, spacing, defaultNumbering, exportHighlight);
                result.paragraphs.push(...ulResult.paragraphs);
                result.numbering.push(...ulResult.numbering);
                break;
            case 'ol':
                // Only create a new numbering definition for a top-level <ol>
                if (listLevel === 0) {
                    // Which glyph each level uses is the list's own choice, made
                    // in the editor and carried on the list as data-regime; a
                    // list without one is the traditional 1. → a. → i.
                    // A list that names its regime gets an "olx-" reference so
                    // that a section-wide cascade (the writ petition's Facts
                    // style) leaves the user's explicit choice alone.
                    const regime = listRegime(node.attributes['data-regime']);
                    const isExplicit = !!node.attributes['data-regime'];
                    currentOlRef = `${isExplicit ? 'olx' : 'ol'}-${olCounterRef.value++}`;
                    // TipTap serializes a list resumed after a break as <ol start="N">
                    // (typing "2." after a paragraph restarts numbering at 2). Word
                    // needs that as the level's start value, else the resumed list
                    // prints "1." again even though the editor shows "2.".
                    const startAt = Math.max(1, parseInt(node.attributes.start || '1', 10) || 1);
                    result.numbering.push({
                        reference: currentOlRef,
                        levels: regime.levels.map((format, level) => ({
                            level,
                            format,
                            text: `%${level + 1}.`,
                            alignment: AlignmentType.START,
                            ...(level === 0 ? { start: startAt } : {}),
                        })),
                    });
                }
                const olResult = treeToDocx(node.children, olCounterRef, listLevel + 1, currentInBlockquote, currentOlRef, spacing, defaultNumbering, exportHighlight);
                result.paragraphs.push(...olResult.paragraphs);
                result.numbering.push(...olResult.numbering);
                break;
            case 'li': {
                // Block-level children (nested lists, quotes) are emitted as their
                // own paragraphs; everything else is the item's own (numbered) text.
                const isBlockChild = (c: SimpleNode | string): c is SimpleNode =>
                    typeof c !== 'string' && ['ul', 'ol', 'blockquote'].includes(c.tagName);
                const leadChildren = node.children.filter(c => !isBlockChild(c));
                const blockChildren = node.children.filter(isBlockChild);

                // Extract plain text, convert quotes, then process with formatting
                const liPlainText = extractPlainText(leadChildren);
                const liConvertedText = convertToSmartQuotes(liPlainText);
                const listItemChildren = processInline(leadChildren, {}, liConvertedText, 0, exportHighlight).runs;
                const hasLead = liConvertedText.trim().length > 0;

                // docx numbering definitions cover levels 0-4 (5 visible levels);
                // clamp defensively in case an older doc nested deeper.
                const markerLevel = Math.min(listLevel - 1, 4);

                if (hasLead || blockChildren.length === 0) {
                     const listParaProps: any = {
                        children: listItemChildren.length > 0 ? listItemChildren : [new TextRun("")], // handle empty li
                        style: "Normal"
                     };

                     if (listLevel > 0) {
                         const indentValue = 360 + (listLevel) * 360;
                         const hangingValue = 360 + (listLevel > 1 ? (listLevel-1)*180 : 0);
                         // `hanging` must live inside `indent` (a positive twip value); a
                         // top-level `hanging` prop is ignored by the docx library, which
                         // is why wrapped list lines previously slid back under the number.
                         listParaProps.indent = { left: indentValue, hanging: hangingValue };
                     }

                     if (currentOlRef) {
                         listParaProps.numbering = { reference: currentOlRef, level: markerLevel };
                     } else {
                         listParaProps.bullet = { level: markerLevel };
                     }

                     if (currentInBlockquote && !listParaProps.indent) {
                        listParaProps.indent = { left: 720, right: 720 };
                     }

                     if (spacing) {
                         listParaProps.spacing = spacing;
                     }

                     result.paragraphs.push(new Paragraph(listParaProps));
                }

                // Emit block children (quotes, nested lists) in document order, at the
                // item's level. Quotes are never numbered; an unnumbered quote doesn't
                // reference the list numbering, so the count of real items never skips.
                blockChildren.forEach(bc => {
                    const childResult = treeToDocx([bc], olCounterRef, listLevel, currentInBlockquote, currentOlRef, spacing, undefined, exportHighlight);
                    result.paragraphs.push(...childResult.paragraphs);
                    result.numbering.push(...childResult.numbering);
                });
                break;
            }
            default:
                 const defaultResult = treeToDocx(node.children, olCounterRef, listLevel, currentInBlockquote, olRef, spacing, defaultNumbering, exportHighlight);
                 result.paragraphs.push(...defaultResult.paragraphs);
                 result.numbering.push(...defaultResult.numbering);
        }
    });

    // Flush any trailing inline run.
    flushInline();

    return result;
}


// Extract plain text from nodes (ignoring formatting) to determine quote context
function extractPlainText(nodes: (SimpleNode | string)[]): string {
    let text = '';
    nodes.forEach(node => {
        if (typeof node === 'string') {
            text += node;
        } else if (typeof node === 'object' && node.tagName) {
            if (node.tagName === 'br') {
                text += '\n';
            } else {
                text += extractPlainText(node.children);
            }
        }
    });
    return text;
}

// Process inline elements like strong, em, u
// fullText: the complete plain text (with smart quotes already converted) for context
// offset: current position in the fullText
function processInline(nodes: (SimpleNode | string)[], currentStyle = {}, fullText = '', offset = 0, exportHighlight = false): { runs: TextRun[], offset: number } {
    let runs: TextRun[] = [];
    let currentOffset = offset;
    
    nodes.forEach(node => {
        if (typeof node === 'string') {
            const length = node.length;
            const convertedText = fullText.substring(currentOffset, currentOffset + length);
            runs.push(new TextRun({ text: convertedText, ...currentStyle }));
            currentOffset += length;
        } else if (typeof node === 'object' && node.tagName) {
            let style = { ...currentStyle };
            switch (node.tagName) {
                case 'strong':
                case 'b':
                    style = { ...style, bold: true };
                    break;
                case 'em':
                case 'i':
                    style = { ...style, italics: true };
                    break;
                case 'u':
                    style = { ...style, underline: { type: UnderlineType.SINGLE } };
                    break;
                case 'mark':
                    if (exportHighlight) {
                        // Prefer data-color (always hex); fallback to hex in style (RGB may appear after browser re-serialization)
                        const dataColor = node.attributes['data-color'];
                        const styleHex = node.attributes.style?.match(/background-color:\s*(#[0-9a-fA-F]{6})/)?.[1];
                        const hexColor = /^#[0-9a-fA-F]{6}$/i.test(dataColor ?? '') ? dataColor : styleHex;
                        if (hexColor) {
                            style = { ...style, shading: { type: ShadingType.CLEAR, color: 'auto', fill: hexColor.replace('#', '').toUpperCase() } };
                        }
                    }
                    break;
                case 'br':
                    runs.push(new TextRun({ break: 1, ...style}));
                    currentOffset += 1; // Account for \n in fullText
                    return; // Continue to next node
            }
            if (node.tagName !== 'br') {
                const result = processInline(node.children, style, fullText, currentOffset, exportHighlight);
                runs.push(...result.runs);
                currentOffset = result.offset;
            }
        }
    });
    return { runs, offset: currentOffset };
}


export function parseHtml(html: string, spacing?: ParagraphSpacing, defaultNumbering?: { reference: string; level: number }, listGeom?: ListGeom): ParseResult {
    // Always reset (never leak the previous caller's geometry).
    quoteListGeom = listGeom ?? DEFAULT_LIST_GEOM;
    const emptyResult: ParseResult = { paragraphs: [new Paragraph("")], numbering: [] };
    if (!html || !html.trim()) return emptyResult;

    // Read exportHighlight from localStorage at export time
    let exportHighlight = false;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
            const stored = window.localStorage.getItem('drafto-settings');
            const parsed = stored ? JSON.parse(stored) : null;
            exportHighlight = parsed?.exportHighlight === true;
            exportQuoteSingleSpacing = parsed?.quoteLineSpacing === 'single';
            exportOutputFontSizePt = parsed?.outputFontSizePt ?? 14;
            exportOutputLineSpacing = parsed?.outputLineSpacing ?? 1.5;
            exportOutputParaAfterPt = parsed?.outputParaAfterPt ?? 12;
        } catch { /* ignore */ }
    }

    // The <ol> reference counter continues across parseHtml calls (module-level
    // seed) instead of restarting at 0 per call. A document is assembled from
    // MANY parseHtml calls (one per rich-text field / list item), and per-call
    // counting gave every field's first list the same "ol-0" reference — in
    // docx one reference is ONE numbering instance, so Word silently CONTINUED
    // the count across unrelated lists: a list showing "1., 2." in the editor
    // printed as "2., 3." because some earlier field's list had consumed "1.".
    const olCounterRef = { value: olRefSeed };
    const sanitizedHtml = html.replace(/\n/g, '');

    const tree = htmlToTree(sanitizedHtml);
    const docxResult = treeToDocx(tree, olCounterRef, 0, false, undefined, spacing, defaultNumbering, exportHighlight);
    olRefSeed = olCounterRef.value;
    
    if (docxResult.paragraphs.length === 0 && !docxResult.numbering.length) {
      const plainText = html.replace(/<[^>]+>/g, '').trim();
      if (plainText) {
        const paraProps: any = { children: [new TextRun(convertToSmartQuotes(plainText))] };
        if (spacing) {
            paraProps.spacing = spacing;
        }
        if (defaultNumbering) {
            paraProps.numbering = defaultNumbering;
        }
        return { paragraphs: [new Paragraph(paraProps)], numbering: [] };
      }
    }
    return docxResult;
}

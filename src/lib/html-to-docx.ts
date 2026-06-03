
import { AlignmentType, Indent, Paragraph, TextRun, UnderlineType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LineRuleType } from "docx";
import { convertToSmartQuotes } from "./docx-helpers";

// Smart (curly) quotation marks used to wrap a quoted block on export.
const SMART_OPEN_QUOTE = '“';  // "
const SMART_CLOSE_QUOTE = '”'; // "

// Set once per export in parseHtml from drafto-settings. When true, quoted
// (blockquote) blocks are forced to single line spacing; the space after the
// last paragraph of each block is then set so the visual gap to the following
// normal text equals the gap between two normal paragraphs (see
// computeQuoteAfterTwips). Otherwise quotes inherit the document's default spacing.
let exportQuoteSingleSpacing = false;
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
            if (!['br'].includes(newNode.tagName)) {
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

    nodes.forEach(node => {
        if (typeof node === 'string') {
            if (node.trim()) {
                 const paragraphProps: any = {
                    children: [new TextRun(convertToSmartQuotes(node))],
                    style: "Normal",
                };
                if (inBlockquote) {
                    paragraphProps.indent = { left: 720, right: 720 };
                }
                if (spacing) {
                    paragraphProps.spacing = spacing;
                }
                if (defaultNumbering && !paragraphProps.numbering) {
                    paragraphProps.numbering = defaultNumbering;
                }
                result.paragraphs.push(new Paragraph(paragraphProps));
            }
            return;
        }

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

                const trNodes = collectTr(node.children);
                const tableRows = trNodes.map(trNode => {
                    const cells = trNode.children
                        .filter((c): c is SimpleNode => typeof c !== 'string' && (c.tagName === 'td' || c.tagName === 'th'))
                        .map(cellNode => {
                            const cellResult = treeToDocx(cellNode.children, olCounterRef, 0, false, undefined, spacing, undefined, exportHighlight);
                            result.numbering.push(...cellResult.numbering);
                            // Ensure at least one paragraph in the cell
                            const cellChildren = cellResult.paragraphs.length > 0
                                ? cellResult.paragraphs
                                : [new Paragraph('')];
                            return new TableCell({
                                children: cellChildren as any,
                                borders: allBorders,
                            });
                        });
                    return new TableRow({ children: cells });
                });

                if (tableRows.length > 0) {
                    result.paragraphs.push(new Table({
                        rows: tableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE },
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
                const quoteLeftIndent = listLevel > 0 ? (360 + listLevel * 360 + 360) : 720;

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
                    currentOlRef = `ol-${olCounterRef.value++}`;
                    result.numbering.push({
                        reference: currentOlRef,
                        levels: [{
                            level: 0,
                            format: "decimal",
                            text: "%1.",
                            alignment: AlignmentType.START,
                        },{
                            level: 1,
                            format: "lowerLetter",
                            text: "%2.",
                            alignment: AlignmentType.START,
                        },{
                            level: 2,
                            format: "lowerRoman",
                            text: "%3.",
                            alignment: AlignmentType.START,
                        },{
                            level: 3,
                            format: "upperLetter",
                            text: "%4.",
                            alignment: AlignmentType.START,
                        },{
                            level: 4,
                            format: "upperRoman",
                            text: "%5.",
                            alignment: AlignmentType.START,
                        }],
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


export function parseHtml(html: string, spacing?: ParagraphSpacing, defaultNumbering?: { reference: string; level: number }): ParseResult {
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

    const olCounterRef = { value: 0 };
    const sanitizedHtml = html.replace(/\n/g, '');

    const tree = htmlToTree(sanitizedHtml);
    const docxResult = treeToDocx(tree, olCounterRef, 0, false, undefined, spacing, defaultNumbering, exportHighlight);
    
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

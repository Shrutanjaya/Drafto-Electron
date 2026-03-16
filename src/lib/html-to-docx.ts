
import { AlignmentType, Indent, Paragraph, TextRun, UnderlineType } from "docx";
import { convertToSmartQuotes } from "./docx-helpers";

// A simple representation of a DOM node
interface SimpleNode {
    tagName: string;
    attributes: { [key: string]: string };
    children: (SimpleNode | string)[];
}

interface ParseResult {
    paragraphs: Paragraph[];
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
function treeToDocx(nodes: (SimpleNode | string)[], olCounterRef: { value: number }, listLevel = 0, inBlockquote = false, olRef?: string, spacing?: ParagraphSpacing): ParseResult {
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
                result.paragraphs.push(new Paragraph(paragraphProps));
            }
            return;
        }

        const currentInBlockquote = inBlockquote || node.tagName === 'blockquote';
        let currentOlRef = olRef;

        switch (node.tagName) {
            case 'p':
                let alignment = AlignmentType.JUSTIFIED;
                if (node.attributes.style?.includes('text-align: center')) alignment = AlignmentType.CENTER;
                if (node.attributes.style?.includes('text-align: right')) alignment = AlignmentType.RIGHT;
                if (node.attributes.style?.includes('text-align: left')) alignment = AlignmentType.LEFT;
                
                // Extract plain text, convert quotes, then process with formatting
                const plainText = extractPlainText(node.children);
                const convertedText = convertToSmartQuotes(plainText);
                
                const paragraphProps: any = {
                    children: processInline(node.children, {}, convertedText, 0).runs,
                    alignment: alignment,
                    style: "Normal",
                };
                if (currentInBlockquote) {
                    paragraphProps.indent = { left: 720, right: 720 };
                }
                if (spacing) {
                    paragraphProps.spacing = spacing;
                }
                result.paragraphs.push(new Paragraph(paragraphProps));
                break;
            case 'blockquote':
                const blockquoteResult = treeToDocx(node.children, olCounterRef, listLevel, true, olRef, spacing);
                result.paragraphs.push(...blockquoteResult.paragraphs);
                result.numbering.push(...blockquoteResult.numbering);
                break;
            case 'ul':
                const ulResult = treeToDocx(node.children, olCounterRef, listLevel + 1, currentInBlockquote, undefined, spacing);
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
                        }],
                    });
                }
                const olResult = treeToDocx(node.children, olCounterRef, listLevel + 1, currentInBlockquote, currentOlRef, spacing);
                result.paragraphs.push(...olResult.paragraphs);
                result.numbering.push(...olResult.numbering);
                break;
            case 'li':
                const directChildren = node.children.filter(c => typeof c === 'string' || !['ul', 'ol'].includes((c as SimpleNode).tagName));
                
                // Extract plain text, convert quotes, then process with formatting
                const liPlainText = extractPlainText(directChildren);
                const liConvertedText = convertToSmartQuotes(liPlainText);
                const listItemChildren = processInline(directChildren, {}, liConvertedText, 0).runs;
                
                if (listItemChildren.length > 0 || node.children.length === 0) {
                     const listParaProps: any = {
                        children: listItemChildren.length > 0 ? listItemChildren : [new TextRun("")], // handle empty li
                        style: "Normal"
                     };

                     if (listLevel > 0) {
                         const indentValue = 360 + (listLevel) * 360;
                         const hangingValue = 360 + (listLevel > 1 ? (listLevel-1)*180 : 0);
                         listParaProps.indent = { left: indentValue };
                         listParaProps.hanging = { firstLine: -hangingValue };
                     }

                     if (currentOlRef) {
                         listParaProps.numbering = { reference: currentOlRef, level: listLevel - 1 };
                     } else {
                         listParaProps.bullet = { level: listLevel - 1 };
                     }

                     if (currentInBlockquote && !listParaProps.indent) {
                        listParaProps.indent = { left: 720, right: 720 };
                     }

                     if (spacing) {
                         listParaProps.spacing = spacing;
                     }

                     result.paragraphs.push(new Paragraph(listParaProps));
                }
                const nestedListResult = treeToDocx(node.children.filter(c => typeof c !== 'string' && ['ul', 'ol'].includes(c.tagName)), olCounterRef, listLevel, currentInBlockquote, currentOlRef, spacing);
                result.paragraphs.push(...nestedListResult.paragraphs);
                result.numbering.push(...nestedListResult.numbering);
                break;
            default:
                 const defaultResult = treeToDocx(node.children, olCounterRef, listLevel, currentInBlockquote, olRef, spacing);
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
function processInline(nodes: (SimpleNode | string)[], currentStyle = {}, fullText = '', offset = 0): { runs: TextRun[], offset: number } {
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
                case 'br':
                    runs.push(new TextRun({ break: 1, ...style}));
                    currentOffset += 1; // Account for \n in fullText
                    return; // Continue to next node
            }
            if (node.tagName !== 'br') {
                const result = processInline(node.children, style, fullText, currentOffset);
                runs.push(...result.runs);
                currentOffset = result.offset;
            }
        }
    });
    return { runs, offset: currentOffset };
}


export function parseHtml(html: string, spacing?: ParagraphSpacing): ParseResult {
    const emptyResult: ParseResult = { paragraphs: [new Paragraph("")], numbering: [] };
    if (!html || !html.trim()) return emptyResult;
    
    const olCounterRef = { value: 0 };
    const sanitizedHtml = html.replace(/\n/g, '');

    const tree = htmlToTree(sanitizedHtml);
    const docxResult = treeToDocx(tree, olCounterRef, 0, false, undefined, spacing);
    
    if (docxResult.paragraphs.length === 0 && !docxResult.numbering.length) {
      const plainText = html.replace(/<[^>]+>/g, '').trim();
      if (plainText) {
        const paraProps: any = { children: [new TextRun(convertToSmartQuotes(plainText))] };
        if (spacing) {
            paraProps.spacing = spacing;
        }
        return { paragraphs: [new Paragraph(paraProps)], numbering: [] };
      }
    }
    return docxResult;
}

// ── Source-document & Rich-Draft extraction for Mayur (AI Assistant) ─────────
// 1. `scanFolder` / `scanFiles`: extracts text from raw case material (PDFs and
//    DOCXs) into a temp context directory for Option [ii] ("Construct from raw
//    material").
// 2. `extractRichDraft`: extracts a single .docx or .pdf draft for Option [i]
//    ("Import verbatim from draft"), preserving bold (<b>), italics (<i>),
//    underline (<u>), strikethrough (<s>), capitalization (including Word's
//    <w:caps/> property), ordered/unordered lists (<ol>/<ul>/<li>), Word Heading
//    styles (<h1>/<h2>/<h3> — ONLY from .docx when Word styles are applied), and
//    table rows/cells (<table><tr><td>...</td></tr></table>) for List of Dates
//    and Grounds tables.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { macSupportsVision, recognisePdfPages } = require("./mac-ocr");

// A page with fewer than this many extracted characters is treated as a scanned
// image (no usable text layer).
const SCANNED_TEXT_THRESHOLD = 15;
// Rough vision cost of reading one rendered page as an image.
const IMAGE_TOKENS_PER_PAGE = 1500;

// Use the CommonJS *legacy* build (pdfjs-dist v3): it works on the Node 18
// runtime bundled with Electron 28 (the ESM v6 build needs Node 22's
// Promise.withResolvers and fails inside Electron). Loaded once, lazily.
let pdfjsLib = null;
function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
    } catch { /* fake worker fallback */ }
  }
  return pdfjsLib;
}

// ~4 chars per token is a good rough estimate for English/legal prose.
function estTextTokens(s) {
  return Math.ceil((s || "").length / 4);
}

function decodeXmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Rich OOXML (.docx) Parser for Verbatim Import ────────────────────────────

function parseAttr(tagStr, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*"([^"]*)"`, "i");
  const m = tagStr.match(re);
  return m ? m[1] : null;
}

function hasToggleProp(rPrXml, tagName) {
  if (!rPrXml) return null;
  const selfClosing = new RegExp(`<w:${tagName}\\s*/>`, "i");
  if (selfClosing.test(rPrXml)) return true;
  const withAttrs = new RegExp(`<w:${tagName}\\b([^>]*)/?>`, "i");
  const m = rPrXml.match(withAttrs);
  if (!m) return null;
  const val = parseAttr(m[1], "w:val");
  if (!val) return true;
  return !/^(0|false|none|off)$/i.test(val);
}

function hasUnderlineProp(rPrXml) {
  if (!rPrXml) return null;
  const m = rPrXml.match(/<w:u\b([^>]*)\/?>/i);
  if (!m) return null;
  const val = parseAttr(m[1], "w:val");
  if (!val) return true;
  return !/^(0|false|none)$/i.test(val);
}

function parseDocxStyles(stylesXml) {
  const styles = new Map();
  if (!stylesXml) return styles;

  const styleRe = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/gi;
  let m;
  while ((m = styleRe.exec(stylesXml))) {
    const attrs = m[1];
    const body = m[2];
    const styleId = parseAttr(attrs, "w:styleId");
    const type = parseAttr(attrs, "w:type") || "paragraph";
    if (!styleId) continue;

    const nameMatch = body.match(/<w:name\b[^>]*w:val="([^"]*)"/i);
    const name = nameMatch ? nameMatch[1] : styleId;
    const basedOnMatch = body.match(/<w:basedOn\b[^>]*w:val="([^"]*)"/i);
    const basedOn = basedOnMatch ? basedOnMatch[1] : null;

    let headingLevel = null;
    const hMatch = name.match(/^heading\s*(\d)$/i) || styleId.match(/^Heading(\d)$/i);
    if (hMatch) {
      headingLevel = parseInt(hMatch[1], 10);
    } else if (type === "paragraph") {
      const outMatch = body.match(/<w:outlineLvl\b[^>]*w:val="(\d+)"/i);
      if (outMatch) {
        const lvl = parseInt(outMatch[1], 10);
        if (lvl >= 0 && lvl <= 5) headingLevel = lvl + 1;
      }
    }

    const rPrMatch = body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/i);
    const rPr = rPrMatch ? rPrMatch[1] : "";
    const pPrMatch = body.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/i);
    const pPr = pPrMatch ? pPrMatch[1] : "";

    let numId = null;
    let ilvl = 0;
    const numPrMatch = pPr.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/i);
    if (numPrMatch) {
      const nIdM = numPrMatch[1].match(/<w:numId\b[^>]*w:val="([^"]*)"/i);
      const ilvlM = numPrMatch[1].match(/<w:ilvl\b[^>]*w:val="([^"]*)"/i);
      if (nIdM) numId = nIdM[1];
      if (ilvlM) ilvl = parseInt(ilvlM[1], 10) || 0;
    }

    styles.set(styleId, {
      styleId,
      type,
      name,
      basedOn,
      headingLevel,
      bold: hasToggleProp(rPr, "b"),
      italic: hasToggleProp(rPr, "i"),
      underline: hasUnderlineProp(rPr),
      strike: hasToggleProp(rPr, "strike") ?? hasToggleProp(rPr, "dstrike"),
      caps: hasToggleProp(rPr, "caps"),
      numId,
      ilvl,
    });
  }

  // Resolve basedOn inheritance (up to 6 hops)
  for (const [, st] of styles) {
    let curr = st.basedOn ? styles.get(st.basedOn) : null;
    let depth = 0;
    while (curr && depth < 6) {
      if (st.headingLevel == null && curr.headingLevel != null) st.headingLevel = curr.headingLevel;
      if (st.bold == null && curr.bold != null) st.bold = curr.bold;
      if (st.italic == null && curr.italic != null) st.italic = curr.italic;
      if (st.underline == null && curr.underline != null) st.underline = curr.underline;
      if (st.strike == null && curr.strike != null) st.strike = curr.strike;
      if (st.caps == null && curr.caps != null) st.caps = curr.caps;
      if (st.numId == null && curr.numId != null) {
        st.numId = curr.numId;
        st.ilvl = curr.ilvl;
      }
      curr = curr.basedOn ? styles.get(curr.basedOn) : null;
      depth++;
    }
  }

  return styles;
}

function parseDocxNumbering(numberingXml) {
  const abstractNums = new Map(); // abstractNumId -> Map(ilvl -> { numFmt, lvlText })
  const numMap = new Map(); // numId -> abstractNumId
  if (!numberingXml) return { getListKind: () => "ol" };

  const absRe = /<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/gi;
  let m;
  while ((m = absRe.exec(numberingXml))) {
    const absId = parseAttr(m[1], "w:abstractNumId");
    if (!absId) continue;
    const lvls = new Map();
    const lvlRe = /<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/gi;
    let lm;
    while ((lm = lvlRe.exec(m[2]))) {
      const ilvl = parseInt(parseAttr(lm[1], "w:ilvl") || "0", 10);
      const fmtM = lm[2].match(/<w:numFmt\b[^>]*w:val="([^"]*)"/i);
      const numFmt = fmtM ? fmtM[1] : "decimal";
      lvls.set(ilvl, { numFmt });
    }
    abstractNums.set(absId, lvls);
  }

  const numRe = /<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/gi;
  while ((m = numRe.exec(numberingXml))) {
    const numId = parseAttr(m[1], "w:numId");
    const absM = m[2].match(/<w:abstractNumId\b[^>]*w:val="([^"]*)"/i);
    if (numId && absM) {
      numMap.set(numId, absM[1]);
    }
  }

  return {
    getListKind(numId, ilvl = 0) {
      const absId = numMap.get(String(numId));
      if (!absId) return "ol";
      const lvls = abstractNums.get(absId);
      const info = lvls?.get(ilvl) || lvls?.get(0);
      if (info && /^bullet$/i.test(info.numFmt)) return "ul";
      return "ol";
    },
  };
}

// Merge adjacent identical inline HTML tags (e.g. </b><b> -> "")
function simplifyInlineHtml(html) {
  if (!html) return "";
  let out = html;
  let prev;
  do {
    prev = out;
    out = out
      .replace(/<\/s>(\s*)<s>/g, "$1")
      .replace(/<\/u>(\s*)<u>/g, "$1")
      .replace(/<\/i>(\s*)<i>/g, "$1")
      .replace(/<\/b>(\s*)<b>/g, "$1");
  } while (out !== prev);
  return out;
}

const ROMAN_PREFIX_RE = /^(?:M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{1,3}))\.(?:\s+|$)/i;
const ALPHA_PREFIX_RE = /^[A-Z]\.(?:\s+|$)/;
const EMPHASIS_NOTE_RE = /\s*\((?:emphasis\s+(?:supplied|added|in\s+original|ours)|italics?\s+(?:supplied|added|in\s+original)|underlining?\s+(?:supplied|added|in\s+original)|words\s+in\s+italics\s+supplied)[^)]*\)\s*$/i;

function parseParagraphXml(pXml, styles, numbering) {
  const pPrMatch = pXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/i);
  const pPr = pPrMatch ? pPrMatch[1] : "";

  const pStyleMatch = pPr.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/i);
  const pStyleId = pStyleMatch ? pStyleMatch[1] : null;
  const pStyle = pStyleId ? styles.get(pStyleId) : null;

  // Word heading level if a Word Heading style is applied on the paragraph
  let headingLevel = pStyle?.headingLevel ?? null;

  // Check paragraph indentation for blockquote detection (left indent >= 360 twips or Quote style)
  const indMatch = pPr.match(/<w:ind\b[^>]*w:left="(\d+)"/i);
  const leftIndent = indMatch ? parseInt(indMatch[1], 10) : 0;
  const isQuoteStyle = pStyleId ? /quote/i.test(pStyleId) : false;
  const isQuote = leftIndent >= 360 || isQuoteStyle;

  // Check list numbering (either direct on paragraph or inherited from paragraph style)
  let numId = null;
  let ilvl = 0;
  const numPrMatch = pPr.match(/<w:numPr>([\s\S]*?)<\/w:numPr>/i);
  if (numPrMatch) {
    const nIdM = numPrMatch[1].match(/<w:numId\b[^>]*w:val="([^"]*)"/i);
    const ilvlM = numPrMatch[1].match(/<w:ilvl\b[^>]*w:val="([^"]*)"/i);
    if (nIdM && nIdM[1] !== "0") {
      numId = nIdM[1];
      ilvl = ilvlM ? parseInt(ilvlM[1], 10) || 0 : 0;
    }
  } else if (pStyle?.numId && pStyle.numId !== "0") {
    numId = pStyle.numId;
    ilvl = pStyle.ilvl || 0;
  }

  // Extract runs (<w:r>...</w:r>) in document order
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/gi;
  let rm;
  let inlineHtml = "";

  while ((rm = runRe.exec(pXml))) {
    const rBody = rm[1];
    // Skip deleted revision runs
    if (/<w:delText\b/i.test(rBody)) continue;

    const rPrMatch = rBody.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/i);
    const rPr = rPrMatch ? rPrMatch[1] : "";
    const rStyleMatch = rPr.match(/<w:rStyle\b[^>]*w:val="([^"]*)"/i);
    const rStyle = rStyleMatch ? styles.get(rStyleMatch[1]) : null;

    const resolveProp = (directVal, charStyleVal, paraStyleVal) => {
      if (directVal !== null && directVal !== undefined) return directVal;
      if (charStyleVal !== null && charStyleVal !== undefined) return charStyleVal;
      // Don't wrap heading text in redundant <b> if it's already a heading tag
      if (headingLevel == null && paraStyleVal !== null && paraStyleVal !== undefined) return paraStyleVal;
      return false;
    };

    const isBold = resolveProp(hasToggleProp(rPr, "b"), rStyle?.bold, pStyle?.bold);
    const isItalic = resolveProp(hasToggleProp(rPr, "i"), rStyle?.italic, pStyle?.italic);
    const isUnderline = resolveProp(hasUnderlineProp(rPr), rStyle?.underline, pStyle?.underline);
    const isStrike = resolveProp(
      hasToggleProp(rPr, "strike") ?? hasToggleProp(rPr, "dstrike"),
      rStyle?.strike,
      pStyle?.strike
    );
    const isCaps = resolveProp(hasToggleProp(rPr, "caps"), rStyle?.caps, pStyle?.caps);

    // Tokenize run content: <w:t>, <w:tab/>, <w:br/>
    const tokenRe = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/gi;
    let tm;
    let runText = "";
    while ((tm = tokenRe.exec(rBody))) {
      const fullToken = tm[0];
      if (/^<w:tab/i.test(fullToken)) {
        runText += "\t";
      } else if (/^<w:br/i.test(fullToken)) {
        runText += "\n";
      } else {
        let decoded = decodeXmlEntities(tm[1] || "");
        if (isCaps) decoded = decoded.toUpperCase();
        runText += escapeHtml(decoded);
      }
    }

    if (!runText) continue;

    // Handle line breaks inside a run while wrapping non-empty segments in inline tags
    const parts = runText.split("\n");
    const wrappedParts = parts.map((seg) => {
      if (!seg) return "";
      // Keep leading/trailing spaces outside formatting tags for clean HTML
      const lead = seg.match(/^\s*/)?.[0] || "";
      const trail = seg.match(/\s*$/)?.[0] || "";
      const core = seg.slice(lead.length, seg.length - trail.length);
      if (!core) return seg;
      let tagged = core;
      if (isStrike) tagged = `<s>${tagged}</s>`;
      if (isUnderline) tagged = `<u>${tagged}</u>`;
      if (isItalic) tagged = `<i>${tagged}</i>`;
      if (isBold) tagged = `<b>${tagged}</b>`;
      return `${lead}${tagged}${trail}`;
    });

    inlineHtml += wrappedParts.join("<br>");
  }

  inlineHtml = simplifyInlineHtml(inlineHtml).trim();

  // If not already assigned a heading level via Word style, check if paragraph text is a bold heading
  if (headingLevel == null && inlineHtml) {
    const plain = inlineHtml.replace(/<[^>]+>/g, "").trim();
    const isBold = /<b>/i.test(inlineHtml);
    if (isBold && plain.length <= 150) {
      if (ROMAN_PREFIX_RE.test(plain)) {
        headingLevel = 1;
      } else if (ALPHA_PREFIX_RE.test(plain)) {
        headingLevel = 2;
      } else if (plain.length >= 4 && plain.length <= 80 && plain === plain.toUpperCase() && /[A-Z]/.test(plain)) {
        if (/^(?:SYNOPSIS|LIST OF DATES|FACTS|GROUNDS|PRAYER|PRAYERS|RELIEFS?|MEMO OF PARTIES|QUESTIONS? OF LAW|INTERIM RELIEF|SUBMISSIONS?|INDEX|APPLICATION)/i.test(plain)) {
          headingLevel = 1;
        }
      }
    }
  }

  const listKind = numId ? numbering.getListKind(numId, ilvl) : null;

  return {
    html: inlineHtml,
    headingLevel,
    isQuote,
    isList: !!numId,
    listKind,
    ilvl,
  };
}

// Find top-level <w:p> and <w:tbl> blocks in an XML container (respecting nested tables)
function tokenizeBlocks(xmlFragment) {
  const blocks = [];
  let pos = 0;
  const n = xmlFragment.length;

  while (pos < n) {
    const nextP = xmlFragment.indexOf("<w:p", pos);
    const nextTbl = xmlFragment.indexOf("<w:tbl", pos);

    if (nextP === -1 && nextTbl === -1) break;

    if (nextP !== -1 && (nextTbl === -1 || nextP < nextTbl)) {
      // Ensure it's <w:p> or <w:p ...> and not <w:pPr>
      const afterChar = xmlFragment[nextP + 4];
      if (afterChar !== ">" && afterChar !== " " && afterChar !== "/") {
        pos = nextP + 4;
        continue;
      }
      // Self-closing <w:p/>?
      const closeBracket = xmlFragment.indexOf(">", nextP);
      if (closeBracket !== -1 && xmlFragment[closeBracket - 1] === "/") {
        pos = closeBracket + 1;
        continue;
      }
      const endP = xmlFragment.indexOf("</w:p>", nextP);
      if (endP === -1) break;
      blocks.push({ type: "p", xml: xmlFragment.slice(nextP, endP + 6) });
      pos = endP + 6;
    } else {
      const afterChar = xmlFragment[nextTbl + 6];
      if (afterChar !== ">" && afterChar !== " ") {
        pos = nextTbl + 6;
        continue;
      }
      // Find matching </w:tbl> accounting for nested tables
      let depth = 0;
      let scan = nextTbl;
      let endTbl = -1;
      while (scan < n) {
        const openIdx = xmlFragment.indexOf("<w:tbl", scan);
        const closeIdx = xmlFragment.indexOf("</w:tbl>", scan);
        if (closeIdx === -1) break;
        if (openIdx !== -1 && openIdx < closeIdx) {
          const c = xmlFragment[openIdx + 6];
          if (c === ">" || c === " ") depth++;
          scan = openIdx + 6;
        } else {
          depth--;
          if (depth <= 0) {
            endTbl = closeIdx + 8;
            break;
          }
          scan = closeIdx + 8;
        }
      }
      if (endTbl === -1) break;
      blocks.push({ type: "tbl", xml: xmlFragment.slice(nextTbl, endTbl) });
      pos = endTbl;
    }
  }
  return blocks;
}

function renderBlocksToHtml(blocks, styles, numbering) {
  const out = [];
  let activeListKind = null; // "ol" | "ul" | null
  let activeQuoteParas = []; // paragraphs currently inside an open blockquote

  const closeListIfOpen = () => {
    if (activeListKind) {
      out.push(`</${activeListKind}>`);
      activeListKind = null;
    }
  };

  const flushQuoteIfOpen = () => {
    if (activeQuoteParas.length === 0) return;
    // Check if the last paragraph inside the quote carries an emphasis note
    let emphasisAttr = "";
    const lastIdx = activeQuoteParas.length - 1;
    const lastP = activeQuoteParas[lastIdx];
    const m = lastP.match(EMPHASIS_NOTE_RE);
    if (m) {
      const rawNote = m[0].replace(/^\s*\(\s*/, "").replace(/\s*\)\s*$/, "").trim();
      emphasisAttr = ` data-emphasis="${rawNote}"`;
      activeQuoteParas[lastIdx] = lastP.replace(EMPHASIS_NOTE_RE, "").trim();
    }
    out.push(`<blockquote${emphasisAttr}>${activeQuoteParas.map((p) => `<p>${p}</p>`).join("")}</blockquote>`);
    activeQuoteParas = [];
  };

  for (const blk of blocks) {
    if (blk.type === "p") {
      const parsed = parseParagraphXml(blk.xml, styles, numbering);
      if (!parsed.html) continue;

      if (parsed.headingLevel != null) {
        closeListIfOpen();
        flushQuoteIfOpen();
        const hTag = `h${Math.min(Math.max(parsed.headingLevel, 1), 3)}`;
        const cleanHeading = parsed.html.replace(/<\/?(?:b|strong)>/gi, "");
        out.push(`<${hTag}>${cleanHeading}</${hTag}>`);
      } else if (parsed.isList) {
        flushQuoteIfOpen();
        const kind = parsed.listKind || "ol";
        if (activeListKind !== kind) {
          closeListIfOpen();
          out.push(`<${kind}>`);
          activeListKind = kind;
        }
        out.push(`<li>${parsed.html}</li>`);
      } else if (parsed.isQuote) {
        closeListIfOpen();
        activeQuoteParas.push(parsed.html);
      } else {
        closeListIfOpen();
        flushQuoteIfOpen();
        out.push(`<p>${parsed.html}</p>`);
      }
    } else if (blk.type === "tbl") {
      closeListIfOpen();
      flushQuoteIfOpen();
      const tblHtml = parseTableXml(blk.xml, styles, numbering);
      if (tblHtml) out.push(tblHtml);
    }
  }

  closeListIfOpen();
  flushQuoteIfOpen();
  return out.join("\n");
}

function parseTableXml(tblXml, styles, numbering) {
  // Strip outer <w:tbl>...</w:tbl>
  const innerStart = tblXml.indexOf(">") + 1;
  const innerEnd = tblXml.lastIndexOf("</w:tbl>");
  if (innerStart <= 0 || innerEnd <= innerStart) return "";
  const inner = tblXml.slice(innerStart, innerEnd);

  // Extract top-level rows <w:tr>...</w:tr>
  const rows = [];
  let pos = 0;
  while (pos < inner.length) {
    const trStart = inner.indexOf("<w:tr", pos);
    if (trStart === -1) break;
    const afterChar = inner[trStart + 5];
    if (afterChar !== ">" && afterChar !== " ") {
      pos = trStart + 5;
      continue;
    }
    let depth = 0;
    let scan = trStart;
    let trEnd = -1;
    while (scan < inner.length) {
      const o = inner.indexOf("<w:tr", scan);
      const c = inner.indexOf("</w:tr>", scan);
      if (c === -1) break;
      if (o !== -1 && o < c && (inner[o + 5] === ">" || inner[o + 5] === " ")) {
        depth++;
        scan = o + 5;
      } else {
        depth--;
        if (depth <= 0) {
          trEnd = c + 7;
          break;
        }
        scan = c + 7;
      }
    }
    if (trEnd === -1) break;
    const trXml = inner.slice(trStart, trEnd);
    pos = trEnd;

    // Extract cells <w:tc>...</w:tc> inside this row
    const cells = [];
    let cPos = 0;
    while (cPos < trXml.length) {
      const tcStart = trXml.indexOf("<w:tc", cPos);
      if (tcStart === -1) break;
      const tcAfter = trXml[tcStart + 5];
      if (tcAfter !== ">" && tcAfter !== " ") {
        cPos = tcStart + 5;
        continue;
      }
      let cDepth = 0;
      let cScan = tcStart;
      let tcEnd = -1;
      while (cScan < trXml.length) {
        const o = trXml.indexOf("<w:tc", cScan);
        const c = trXml.indexOf("</w:tc>", cScan);
        if (c === -1) break;
        if (o !== -1 && o < c && (trXml[o + 5] === ">" || trXml[o + 5] === " ")) {
          cDepth++;
          cScan = o + 5;
        } else {
          cDepth--;
          if (cDepth <= 0) {
            tcEnd = c + 7;
            break;
          }
          cScan = c + 7;
        }
      }
      if (tcEnd === -1) break;
      const tcInnerStart = trXml.indexOf(">", tcStart) + 1;
      const tcInner = trXml.slice(tcInnerStart, tcEnd - 7);
      cPos = tcEnd;

      const cellBlocks = tokenizeBlocks(tcInner);
      const cellHtml = renderBlocksToHtml(cellBlocks, styles, numbering);
      cells.push(`<td>${cellHtml}</td>`);
    }

    if (cells.length > 0 && cells.some((c) => c !== "<td></td>")) {
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
  }

  if (rows.length === 0) return "";
  return `<table>\n${rows.join("\n")}\n</table>`;
}

async function extractRichDocx(docxPath) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) return "";

  const [docXml, stylesXml, numberingXml] = await Promise.all([
    docEntry.async("string"),
    zip.file("word/styles.xml")?.async("string") ?? Promise.resolve(""),
    zip.file("word/numbering.xml")?.async("string") ?? Promise.resolve(""),
  ]);

  const styles = parseDocxStyles(stylesXml);
  const numbering = parseDocxNumbering(numberingXml);

  const bodyMatch = docXml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/i);
  const bodyXml = bodyMatch ? bodyMatch[1] : docXml;
  const blocks = tokenizeBlocks(bodyXml);
  return renderBlocksToHtml(blocks, styles, numbering);
}

// ── Rich PDF Extractor for Verbatim Import ───────────────────────────────────
// Reconstructs visual lines, preserves bold/italic spans from PDF font names,
// and detects multi-column table rows (such as List of Dates [Date | Event] or
// Grounds [Letter | Ground]) via X-coordinate clustering.

async function extractRichPdf(pdfPath) {
  const pdfjs = getPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pageBlocks = [];
  const scannedPages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const stylesMap = content.styles || {};

    const rawItems = (content.items || []).filter((it) => it && typeof it.str === "string" && it.str.length > 0);
    const plainCheck = rawItems.map((it) => it.str).join(" ").trim();
    if (plainCheck.length < SCANNED_TEXT_THRESHOLD) {
      scannedPages.push(i);
      page.cleanup();
      continue;
    }

    // Group items into visual lines by Y coordinate (within 3.5pt tolerance)
    const lines = [];
    for (const it of rawItems) {
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      const x = tr[4] || 0;
      const y = tr[5] || 0;
      const w = it.width || 0;
      const fontName = String(it.fontName || "");
      const styleObj = stylesMap[fontName] || {};
      const fontDesc = `${fontName} ${styleObj.fontFamily || ""}`;
      const isBold = /bold|black|heavy|demi|semibold/i.test(fontDesc);
      const isItalic = /italic|oblique/i.test(fontDesc);

      let line = lines.find((l) => Math.abs(l.y - y) <= 3.5);
      if (!line) {
        line = { y, runs: [] };
        lines.push(line);
      }
      line.runs.push({ x, endX: x + w, str: it.str, isBold, isItalic });
    }

    // Sort lines top-to-bottom (higher Y is higher on PDF page)
    lines.sort((a, b) => b.y - a.y);

    const renderedLines = [];
    for (const line of lines) {
      line.runs.sort((a, b) => a.x - b.x);
      // Detect column gaps (> 18pt between end of previous run and start of next run)
      const segments = [];
      let currentSeg = null;

      for (const r of line.runs) {
        const escaped = escapeHtml(r.str);
        let formatted = escaped;
        if (escaped.trim()) {
          if (r.isItalic) formatted = `<i>${formatted}</i>`;
          if (r.isBold) formatted = `<b>${formatted}</b>`;
        }
        if (!currentSeg) {
          currentSeg = { startX: r.x, endX: r.endX, html: formatted };
        } else {
          const gap = r.x - currentSeg.endX;
          if (gap > 22) {
            currentSeg.html = simplifyInlineHtml(currentSeg.html).trim();
            segments.push(currentSeg);
            currentSeg = { startX: r.x, endX: r.endX, html: formatted };
          } else {
            const needSpace = gap > 2.5 && !/\s$/.test(currentSeg.html) && !/^\s/.test(r.str);
            currentSeg.html += (needSpace ? " " : "") + formatted;
            currentSeg.endX = Math.max(currentSeg.endX, r.endX);
          }
        }
      }
      if (currentSeg) {
        currentSeg.html = simplifyInlineHtml(currentSeg.html).trim();
        if (currentSeg.html) segments.push(currentSeg);
      }

      if (segments.length === 0) continue;
      if (segments.length >= 2) {
        renderedLines.push(
          `<tr>${segments.map((s) => `<td>${s.html}</td>`).join("")}</tr>`
        );
      } else {
        const segHtml = segments[0].html;
        const plain = segHtml.replace(/<[^>]+>/g, "").trim();
        const isBold = /<b>/i.test(segHtml);
        if (isBold && plain.length <= 150 && ROMAN_PREFIX_RE.test(plain)) {
          renderedLines.push(`<h1>${plain}</h1>`);
        } else if (isBold && plain.length <= 150 && ALPHA_PREFIX_RE.test(plain)) {
          renderedLines.push(`<h2>${plain}</h2>`);
        } else {
          renderedLines.push(`<p>${segHtml}</p>`);
        }
      }
    }

    // Wrap consecutive <tr> lines in <table>...</table>
    const grouped = [];
    let inTable = false;
    for (const rl of renderedLines) {
      if (rl.startsWith("<tr>")) {
        if (!inTable) {
          grouped.push("<table>");
          inTable = true;
        }
        grouped.push(rl);
      } else {
        if (inTable) {
          grouped.push("</table>");
          inTable = false;
        }
        grouped.push(rl);
      }
    }
    if (inTable) grouped.push("</table>");

    pageBlocks.push(`<!-- Page ${i} -->\n${grouped.join("\n")}`);
    page.cleanup();
  }

  // If macOS Vision OCR is available and some pages were scanned, recover them
  if (scannedPages.length > 0 && macSupportsVision()) {
    try {
      const recognised = await recognisePdfPages(pdfPath, scannedPages);
      for (const pno of scannedPages) {
        if (recognised[pno]) {
          pageBlocks.push(`<!-- Page ${pno} (OCR) -->\n<p>${escapeHtml(recognised[pno])}</p>`);
        }
      }
    } catch {}
  }

  await pdf.cleanup();
  return pageBlocks.join("\n\n");
}

// Entry point for Option [i]: Import verbatim from a single .docx or .pdf draft
async function extractRichDraft(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) {
    return { ok: false, error: "Draft file not found." };
  }
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".docx") {
      const html = await extractRichDocx(filePath);
      if (!html || !html.trim()) {
        return { ok: false, error: "The Word document appears to be empty." };
      }
      return {
        ok: true,
        fileName: path.basename(filePath),
        format: "docx",
        richText: html,
        tokens: estTextTokens(html),
      };
    }
    if (ext === ".pdf") {
      const html = await extractRichPdf(filePath);
      if (!html || !html.trim()) {
        return {
          ok: false,
          error: "Could not extract text from this PDF (it may be a scanned image without an OCR text layer).",
        };
      }
      return {
        ok: true,
        fileName: path.basename(filePath),
        format: "pdf",
        richText: html,
        tokens: estTextTokens(html),
      };
    }
    return { ok: false, error: "Unsupported file format. Please select a .docx or .pdf file." };
  } catch (e) {
    return { ok: false, error: `Failed to read draft: ${e.message}` };
  }
}

// ── Raw-material extraction for Option [ii] (Construct from raw material) ────

async function extractPdfPages(pdfPath) {
  const pdfjs = getPdfjs();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
    pages.push(text);
    page.cleanup();
  }
  await pdf.cleanup();
  return pages;
}

async function extractDocxText(docxPath) {
  // Use the rich extractor so tables and formatting in raw-material .docx files
  // are also preserved for the model.
  try {
    const rich = await extractRichDocx(docxPath);
    if (rich && rich.trim()) return rich;
  } catch {}
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  let xml = await entry.async("string");
  xml = xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n");
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Shared processor. `sources` is a list of { name, full }. Returns the same shape
// as before: { ok, contextDir, files, textTokens, scannedPageCount, imageTokens }.
async function processSources(sources) {
  const contextDir = path.join(os.tmpdir(), `drafto-ai-${crypto.randomBytes(6).toString("hex")}`);
  fs.mkdirSync(contextDir, { recursive: true });

  const files = [];
  let textTokens = 0;
  let scannedPageCount = 0;
  let extractedAny = false;
  let lastError = null;

  // Keep txt names unique even if two sources share a base name.
  const usedTxt = new Set();
  const uniqueTxt = (base) => {
    let t = `${base}.txt`;
    let n = 1;
    while (usedTxt.has(t)) t = `${base}-${n++}.txt`;
    usedTxt.add(t);
    return t;
  };

  for (const { name, full } of sources) {
    const isDocx = /\.docx$/i.test(name);
    try {
      if (isDocx) {
        const text = await extractDocxText(full);
        extractedAny = true;
        textTokens += estTextTokens(text);
        const txtName = uniqueTxt(name.replace(/\.docx$/i, ""));
        fs.writeFileSync(path.join(contextDir, txtName), `Source document: ${name}\n\n[Page 1]\n${text}\n`, "utf8");
        // Word has no fixed pages; report as a single page, never "scanned".
        files.push({ name, originalPath: full, pageCount: 1, scannedPages: [], txtName });
      } else {
        const pages = await extractPdfPages(full);
        extractedAny = true;
        const scannedPages = [];
        const lines = [];

        // Pages with no text layer: on macOS, recognise them locally with the
        // system's own text recognition before falling back to sending images to
        // the model. Free, and it keeps a scanned paper-book affordable.
        const noTextPages = pages
          .map((t, i) => (t.length < SCANNED_TEXT_THRESHOLD ? i + 1 : 0))
          .filter(Boolean);
        let recognised = {};
        if (noTextPages.length > 0 && macSupportsVision()) {
          try {
            recognised = await recognisePdfPages(full, noTextPages);
          } catch { /* fall through to the image path */ }
        }

        pages.forEach((t, idx) => {
          const pno = idx + 1;
          if (t.length < SCANNED_TEXT_THRESHOLD) {
            const ocr = recognised[pno];
            if (ocr && ocr.length >= SCANNED_TEXT_THRESHOLD) {
              // Recovered locally — the model reads it as ordinary text.
              textTokens += estTextTokens(ocr);
              lines.push(`[Page ${pno}] (read by text recognition)\n${ocr}`);
            } else {
              scannedPages.push(pno);
              lines.push(`[Page ${pno}: scanned image — no extractable text]`);
            }
          } else {
            textTokens += estTextTokens(t);
            lines.push(`[Page ${pno}]\n${t}`);
          }
        });
        scannedPageCount += scannedPages.length;
        const txtName = uniqueTxt(name.replace(/\.pdf$/i, ""));
        try {
          fs.writeFileSync(path.join(contextDir, txtName), `Source document: ${name}\n\n${lines.join("\n\n")}\n`, "utf8");
        } catch { /* ignore individual write failures */ }
        files.push({ name, originalPath: full, pageCount: pages.length, scannedPages, txtName });
      }
    } catch (e) {
      lastError = e.message;
      files.push({ name, originalPath: full, pageCount: 0, scannedPages: [], error: e.message });
    }
  }

  if (!extractedAny) {
    try { fs.rmSync(contextDir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: `Couldn't read any text from the documents${lastError ? ` (${lastError})` : ""}.` };
  }

  return {
    ok: true,
    contextDir,
    files,
    textTokens,
    scannedPageCount,
    imageTokens: scannedPageCount * IMAGE_TOKENS_PER_PAGE,
  };
}

// Scan a folder of source documents (PDF + DOCX).
async function scanFolder(folderPath) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath).filter((f) => /\.(pdf|docx)$/i.test(f));
  } catch (e) {
    return { ok: false, error: `Couldn't read that folder: ${e.message}` };
  }
  if (entries.length === 0) return { ok: false, error: "No PDF or Word files found in that folder." };
  return processSources(entries.map((name) => ({ name, full: path.join(folderPath, name) })));
}

// Scan an explicit list of picked files (PDF + DOCX).
async function scanFiles(filePaths) {
  const list = (filePaths || []).filter((p) => /\.(pdf|docx)$/i.test(p));
  if (list.length === 0) return { ok: false, error: "No PDF or Word files selected." };
  return processSources(list.map((full) => ({ name: path.basename(full), full })));
}

module.exports = { scanFolder, scanFiles, extractRichDraft };

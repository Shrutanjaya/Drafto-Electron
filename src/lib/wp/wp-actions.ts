// Delhi High Court writ-petition document generators. Each returns a base64
// .docx (mirroring the SLP generators in actions.ts). PDF assembly, pagination
// and bookmarking are handled separately at PDF-generation time (Phase 7).

import {
  Packer,
  Document,
  Header,
  Footer,
  Paragraph,
  PageBreak,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  TextRun,
} from "docx";
import { format } from "date-fns";
import { getPartyHeader, smartTextRun, convertToSmartQuotes } from "@/lib/docx-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import type { DraftoProject, Annexure } from "@/lib/schema";
import {
  createWpHeader,
  createWpPartiesHeader,
  createWpFiledBy,
  createSalutation,
  getWpStyles,
  getWpMargins,
  NO_BORDERS,
  partyPosition,
} from "./wp-helpers";
import { cascadeFor, enumLabel, type EnumStyle } from "./wp-numbering";
import { wpAnnexureOrder, annexLabel, cmAnnexureOrder, cmAnnexLabel, cmAnnexBodySentence, cmAnnexIndexText, type CmAnnexEntry } from "./wp-annexures";
import { resolveFactsHtml } from "./facts-mode";
import { factsAnnexureSentenceParts, inlineHtml } from "./wp-facts";
import { getWpNumbering, getWpOutputFormatting, getWpVakFormatting, getWpFiledBy } from "./wp-settings";

const cellMargins = { top: 0, bottom: 0, left: 115, right: 115 };
const tableSpacing = { before: 120, after: 120 };

// ── Shared utilities ────────────────────────────────────────────────────────

function partyHeaders(project: DraftoProject) {
  return {
    petHeader: getPartyHeader(project.petitioners) || "[Petitioner]",
    resHeader: getPartyHeader(project.respondents) || "[Respondents]",
  };
}

// The vakalatnama carries its own (smaller, single-spaced) formatting so it
// fits on a single page — Settings → Writ Petition → Vakalatnama.
function wpVakStyles() {
  const f = getWpOutputFormatting();
  const v = getWpVakFormatting();
  return {
    paragraphStyles: [{
      id: "Normal", name: "Normal", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font: f.font, size: Math.round(v.sizePt * 2) },
      paragraph: {
        spacing: { line: Math.round(v.lineSpacing * 240), after: Math.round(v.afterPt * 20), before: 0 },
        alignment: AlignmentType.JUSTIFIED,
      },
    }],
  };
}

function wpDoc(children: (Paragraph | Table)[], numbering?: any[], opts?: { vak?: boolean }) {
  return new Document({
    styles: opts?.vak ? wpVakStyles() : getWpStyles(),
    ...(numbering && numbering.length ? { numbering: { config: numbering } } : {}),
    sections: [{
      properties: { page: { margin: getWpMargins() } },
      headers: { default: new Header({ children: [] }) },
      footers: { default: new Footer({ children: [] }) },
      children,
    }],
  });
}

async function pack(doc: Document, fileName: string) {
  const docx = await Packer.toBase64String(doc);
  return { success: true as const, docx, fileName };
}

// Index-style annexure sentence: "Annexure P-1: A true copy of … dated …."
function annexIndexRuns(pNumber: number, annex: Annexure): (TextRun | string)[] {
  const copy = annex.copyType || "true copy";
  const article = copy.startsWith("true") || copy.startsWith("typed") || copy.startsWith("translated") ? "A " : "A ";
  const runs: (TextRun | string)[] = [
    smartTextRun({ text: `${annexLabel(pNumber, annex)}: `, bold: true }),
    convertToSmartQuotes(`${article}${copy} of ${annex.title || "[description]"}`),
  ];
  if (annex.date) runs.push(convertToSmartQuotes(` dated ${annex.date}`));
  const last = runs[runs.length - 1];
  if (typeof last === "string") {
    const t = last.trimEnd();
    runs[runs.length - 1] = /[.!?]$/.test(t) ? t : t + ".";
  }
  return runs;
}


// True if the rich-text HTML has any visible text.
function htmlHasText(html?: string): boolean {
  return !!(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Append plain-text sentences INSIDE the ground's final block element so they
// stay part of the same numbered paragraph (a trailing loose text node would
// become a separate, unnumbered paragraph).
function appendSentencesToHtml(html: string, sentences: string[]): string {
  if (!sentences.length) return html;
  const tail = " " + sentences.map(escapeHtmlText).join(" ");
  const m = (html || "").match(/^([\s\S]*)(<\/(?:p|li)>\s*)$/i);
  if (m) return `${m[1]}${tail}${m[2]}`;
  return ((html || "") + tail).trim();
}

// ── Native Word numbering ────────────────────────────────────────────────────
// Numbering is emitted as real Word auto-lists (not literal text), so numbers
// renumber on manual edits. Trade-off: native lists can't do glyph-doubling
// (aa, bb, cc) — beyond the first cycle they roll over per Word's own scheme.

// Top-level decimal list ("1.", "2.", …).
function decimalDef(reference: string) {
  return { reference, levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 480, hanging: 480 } } } }] };
}

// Sub-list whose first level uses the configured section style; deeper levels
// follow the cascade.
function styleDef(reference: string, style: EnumStyle) {
  const cascade = cascadeFor(style);
  return { reference, levels: cascade.map((fmt, i) => ({ level: i, format: fmt, text: `%${i + 1})`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 + i * 360, hanging: 360 } } } })) };
}

// Allocates fresh numbering references (so each list restarts at 1/a) and
// collects their definitions for the Document.
function numberer() {
  const defs: any[] = [];
  let seq = 0;
  return {
    defs,
    decimal() { const r = `wpn-d-${seq++}`; defs.push(decimalDef(r)); return r; },
    styled(style: EnumStyle) { const r = `wpn-s-${seq++}`; defs.push(styleDef(r, style)); return r; },
  };
}

// A plain-text auto-numbered list item.
function listItem(reference: string, text: string, opts?: { bold?: boolean; before?: number }): Paragraph {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { before: opts?.before ?? 0 },
    children: [smartTextRun(opts?.bold ? { text, bold: true } : text)],
  });
}

// An auto-numbered list item with mixed runs (e.g. a bold "Prayers:" prefix).
function listItemRuns(reference: string, runs: (TextRun | string)[], before = 120): Paragraph {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { before },
    children: runs.map(r => (typeof r === "string" ? smartTextRun(r) : r)),
  });
}

// Rich-text auto-numbered list items: each HTML item's paragraphs are bound to
// `reference` via parseHtml's defaultNumbering hook (so formatting survives and
// raw tags never leak). Nested numbering defs are collected into `collect`.
function htmlListItems(reference: string, items: string[], collect: any[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const html of items) {
    const parsed = parseHtml(html || "", undefined, { reference, level: 0 });
    if (parsed.numbering.length) collect.push(...parsed.numbering);
    out.push(...parsed.paragraphs);
  }
  return out;
}

// Rewrite the level formats of the Facts <ol> numbering (produced by parseHtml)
// so its sub-paragraphs use the configured Facts style and cascade.
function applyFactsCascade(numbering: any[], style: EnumStyle) {
  const cascade = cascadeFor(style);
  for (const cfg of numbering) {
    if (typeof cfg?.reference === "string" && cfg.reference.startsWith("ol-") && Array.isArray(cfg.levels)) {
      cfg.levels.forEach((lvl: any, i: number) => { if (cascade[i]) lvl.format = cascade[i]; });
    }
  }
}

function centeredBold(text: string, spacing?: { before?: number; after?: number }): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing, children: [smartTextRun({ text, bold: true })] });
}

// ── Notice of Motion ────────────────────────────────────────────────────────

export async function generateWpNoticeOfMotion(project: DraftoProject, includeSignature = false) {
  const { petHeader, resHeader } = partyHeaders(project);
  const listing = project.wp.listingDate ? format(new Date(project.wp.listingDate), "dd.MM.yyyy") : "________";
  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("NOTICE OF MOTION", { before: 360 }),
    new Paragraph({ children: [smartTextRun("Sir/Ma’am")] }),
    new Paragraph({ children: [
      smartTextRun("The enclosed Application is being filed on behalf of the Applicant and is likely to be listed on "),
      smartTextRun({ text: listing, bold: true }),
      smartTextRun(" or any date after that. Please take notice accordingly."),
    ]}),
    ...createWpFiledBy(project, { includeSignature }),
  ]);
  return pack(doc, "WP-NoticeOfMotion.docx");
}

// ── Urgency Application ─────────────────────────────────────────────────────

export async function generateWpUrgencyApplication(project: DraftoProject, includeSignature = false) {
  const { petHeader, resHeader } = partyHeaders(project);
  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("URGENCY APPLICATION", { before: 360 }),
    ...createSalutation(["To", "The Deputy Registrar,", "Delhi High Court."]),
    new Paragraph({ children: [smartTextRun("Sir,")] }),
    new Paragraph({ children: [smartTextRun("For the reasons stated in the accompanying writ petition, the same may be listed before the Hon’ble Court urgently as per the applicable rules.")] }),
    ...createWpFiledBy(project, { includeSignature }),
  ]);
  return pack(doc, "WP-UrgencyApplication.docx");
}

// ── Memo of Parties ─────────────────────────────────────────────────────────

export async function generateWpMemoOfParties(project: DraftoProject, includeSignature = false) {
  const { petHeader, resHeader } = partyHeaders(project);

  const headerRow = new TableRow({ children: [
    new TableCell({ children: [centeredBoldCell("S. No.")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins, width: { size: 10, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [centeredBoldCell("Particulars")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins, width: { size: 65, type: WidthType.PERCENTAGE } }),
    new TableCell({ children: [centeredBoldCell("Position")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins, width: { size: 25, type: WidthType.PERCENTAGE } }),
  ]});

  const partyRows = (parties: typeof project.petitioners, role: "Petitioner" | "Respondent") =>
    parties.map((p, i) => new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, spacing: tableSpacing })], verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
      new TableCell({ children: [
        new Paragraph({ children: [smartTextRun({ text: p.name || "[Name]", bold: true })], spacing: tableSpacing }),
        // Service designation, e.g. "Through its Standing Counsel".
        ...(p.through?.trim() ? [new Paragraph({ children: [smartTextRun({ text: p.through.trim(), italics: true })], spacing: tableSpacing })] : []),
        ...(p.address ? [new Paragraph({ text: p.address, spacing: tableSpacing })] : []),
      ], verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
      new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun(partyPosition(role, i, parties.length))], spacing: tableSpacing })], verticalAlign: VerticalAlign.BOTTOM, margins: cellMargins }),
    ]}));

  const versusRow = new TableRow({ children: [
    new TableCell({ columnSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("Versus")], spacing: tableSpacing })], margins: cellMargins }),
  ]});

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1000, 6500, 2500],
    borders: NO_BORDERS,
    rows: [headerRow, ...partyRows(project.petitioners, "Petitioner"), versusRow, ...partyRows(project.respondents, "Respondent")],
  });

  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("MEMO OF PARTIES", { before: 240 }),
    table,
    ...createWpFiledBy(project, { includeSignature }),
  ]);
  return pack(doc, "WP-MemoOfParties.docx");
}

function centeredBoldCell(text: string): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text, bold: true })], spacing: tableSpacing });
}

// ── Synopsis and List of Dates ──────────────────────────────────────────────
// WP places annexure sentences in the Facts section, NOT in the List of Dates,
// so the LoD here is date/event only.

export async function generateWpSynopsisAndLod(project: DraftoProject) {
  const numbering: any[] = [];
  const synopsis = parseHtml(project.synopsis || "");
  numbering.push(...synopsis.numbering);

  const lodRows = (project.listOfDates || []).map(lod => {
    const ev = parseHtml(lod.event || "", tableSpacing);
    numbering.push(...ev.numbering);
    return new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ text: lod.date || "", alignment: AlignmentType.CENTER, spacing: tableSpacing })], width: { size: 20, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
      new TableCell({ children: ev.paragraphs.length ? ev.paragraphs : [new Paragraph("")], width: { size: 80, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
    ]});
  });

  const lodTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2000, 8000],
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [centeredBoldCell("Date")], width: { size: 20, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
        new TableCell({ children: [centeredBoldCell("Particulars")], width: { size: 80, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
      ]}),
      ...lodRows,
    ],
  });

  const uniqueNumbering = numbering.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i);

  const children: (Paragraph | Table)[] = [
    centeredBold("SYNOPSIS"),
    ...synopsis.paragraphs,
  ];
  // Optionally start the List of Dates on a fresh page.
  if (project.wp.splitSynopsisAndLod) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  children.push(centeredBold("LIST OF DATES"), lodTable);

  const doc = wpDoc(children, uniqueNumbering);
  return pack(doc, "WP-SynopsisAndListOfDates.docx");
}

// ── Reliefs ────────────────────────────────────────────────────────────────
// Single source of truth — all reliefs (including any quash relief in an IO
// writ, and the residuary prayer last) are user-authored, and the FULL list
// (residuary included) prints in all three places: the top reliefs block,
// Para 1, and the final Prayers block (para 8).

function reliefItems(project: DraftoProject): string[] {
  return (project.wp.reliefs || []).map(r => r.particulars || "").filter(htmlHasText);
}

// ── Writ Petition (body + affidavit) ────────────────────────────────────────

export async function generateWpPetition(project: DraftoProject, opts?: { includeAffidavit?: boolean; includeSignature?: boolean }) {
  const includeAffidavit = opts?.includeAffidavit ?? true;
  const includeSignature = opts?.includeSignature ?? false;
  const { petHeader, resHeader } = partyHeaders(project);
  const article = project.wp.articleBasis;
  const reliefs = reliefItems(project);

  const num = getWpNumbering();
  const nb = numberer();
  const numbering = nb.defs;

  const mainRef = nb.decimal();              // top-level 1.–8.
  const reliefsTopRef = nb.styled(num.prayers);
  const groundsRef = nb.styled(num.grounds);
  const prayersRef = nb.styled(num.prayers);

  // Para 1 restates the prayers verbatim as ONE flowing numbered paragraph —
  // "… and: [a] …; [b] …" — the letters inline (matching the configured
  // prayers style) and the user's own punctuation preserved untouched
  // (including the final full stop after the residuary prayer).
  const para1Html = `<p>This Writ Petition is filed praying that this Hon’ble Court may be pleased to issue an appropriate writ, order or direction and: ${reliefs
    .map((h, i) => `[${enumLabel(i, num.prayers)}] ${inlineHtml(h)}`)
    .join(" ")}</p>`;
  const para1 = parseHtml(para1Html, { before: 120 }, { reference: mainRef, level: 0 });
  numbering.push(...para1.numbering);

  // Para 1 ends with an annexure sentence for each document marked as an
  // Impugned Order ("Annexure P-1 is a true copy of … dated …."), the
  // "Annexure P-N" label in bold.
  const ioSentenceRuns: TextRun[] = wpAnnexureOrder(project)
    .filter(e => e.annex.isImpugnedOrder)
    .flatMap((e, i) => {
      const { label, rest } = factsAnnexureSentenceParts(e.pNumber, e.annex);
      return [
        smartTextRun({ text: `${i > 0 ? " " : ""}${label}`, bold: true }),
        smartTextRun(rest),
      ];
    });

  const facts = parseHtml(resolveFactsHtml(project) || "");
  applyFactsCascade(facts.numbering, num.facts);
  numbering.push(...facts.numbering);

  const groundStrings = (project.grounds || []).map(g => g.particulars).filter(htmlHasText);

  const children: (Paragraph | Table)[] = [
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold(`Writ Petition under Article ${article} of the Constitution of India`, { before: 240 }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("PRAYING FOR THE FOLLOWING RELIEFS:")] }),
    ...htmlListItems(reliefsTopRef, reliefs, numbering),
    // Salutation (indented, italic)
    ...createSalutation(["To", "The Hon’ble Chief Justice of the Delhi High Court", "And His Companion Justices of the Hon’ble High Court of Delhi"]),
    new Paragraph({ children: [smartTextRun({ text: "The Petitioner most respectfully submits that:", bold: true })] }),
    // 1. Intro — the prayers verbatim inline (all of them, residuary included),
    // then the impugned order/document annexure sentence(s).
    ...para1.paragraphs,
    ...(ioSentenceRuns.length ? [new Paragraph({
      indent: { left: 480 }, // continuation of para 1 (aligns with its text)
      children: ioSentenceRuns,
    })] : []),
    // 2. Facts
    listItemRuns(mainRef, [smartTextRun({ text: "FACTS", bold: true }), ": The facts and circumstances giving rise to this writ petition are as under:"]),
    ...(facts.paragraphs.length ? facts.paragraphs : [new Paragraph({ children: [smartTextRun("[Facts — generated from the List of Dates.]")] })]),
    // 3. Grounds
    listItemRuns(mainRef, [smartTextRun({ text: "GROUNDS", bold: true }), ": This writ petition is filed on the following grounds which are taken in addition and without prejudice to each other:"]),
    ...htmlListItems(groundsRef, groundStrings, numbering),
    // 4–7 boilerplate
    listItem(mainRef, "This Hon’ble Court has the necessary jurisdiction to entertain this Writ Petition as the Respondents are situated within, and the cause of action has arisen within, the territorial jurisdiction of this Hon’ble Court.", { before: 120 }),
    listItem(mainRef, "The Petitioner has no other equally efficacious alternate remedy available to approach this Hon’ble Court.", { before: 120 }),
    listItem(mainRef, "The Petitioner has not filed any other Writ Petition or proceeding before the Hon’ble Supreme Court or before this Hon’ble Court or any other Court seeking the same or similar relief.", { before: 120 }),
    listItem(mainRef, "The Petitioner craves leave of this Hon’ble Court to produce additional documents and/or affidavits and to add, alter or amend this Writ Petition at a later stage of the proceedings, if required.", { before: 120 }),
    // 8. Prayers
    listItemRuns(mainRef, [smartTextRun({ text: "PRAYERS:", bold: true }), " In view of the foregoing submissions, it is respectfully prayed that this Hon’ble Court may be pleased to issue an appropriate writ, order or direction and:"]),
    ...htmlListItems(prayersRef, reliefs, numbering),
    // The petition body's Filed-by block is the ONLY one that shows "Drawn on".
    ...createWpFiledBy(project, { includeSignature, showDrawnOn: true }),
    // Affidavit (the index lists the petition "with affidavit"). Omitted for the
    // PDF path, which appends the affidavit (generated or uploaded) separately.
    ...(includeAffidavit ? [
      new Paragraph({ children: [new PageBreak()] }),
      ...buildAffidavitChildren(project, "petition", petHeader, resHeader, numbering),
    ] : []),
  ];

  return pack(wpDoc(children, numbering), "WP-Petition.docx");
}

// Standalone petition affidavit (used by the PDF path so an uploaded signed
// affidavit can replace it).
export async function generateWpAffidavit(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  const nb = numberer();
  const children = buildAffidavitChildren(project, "petition", petHeader, resHeader, nb.defs);
  return pack(wpDoc(children, nb.defs), "WP-Affidavit.docx");
}

// ── Affidavit (shared by the petition and CMs) ──────────────────────────────

// The deponent defaults to the sole/first petitioner's name when not set.
function deponentName(project: DraftoProject): string {
  return project.deponent?.name?.trim() || project.petitioners?.[0]?.name?.trim() || "[Deponent]";
}

// Opening affidavit paragraph, phrased for the deponent's capacity (the shared
// deponent.role — Petitioner / Authorised Representative / Pairokar / Legal
// Guardian / PoA holder) and for multi-petitioner writs.
function deponentCapacityPara(project: DraftoProject, kind: "petition" | "cm"): string {
  const multi = (project.petitioners?.length || 0) > 1;
  const role = project.deponent?.role || "Petitioner";
  const applicant = kind === "cm" ? " and the Applicant in the present Application" : "";
  const conversant = "I am fully conversant with the facts of the case and hence competent to swear to this Affidavit.";
  if (role === "Petitioner" || role === "Petitioner No. 1") {
    const label = multi || role === "Petitioner No. 1" ? "Petitioner No. 1" : "Petitioner";
    const behalf = multi ? " I am duly authorised to swear to this Affidavit on behalf of all the Petitioners." : "";
    return `I am the ${label} in the captioned Writ Petition${applicant}.${behalf} ${conversant}`;
  }
  // Representative capacities: state the capacity and the authorisation.
  return `I am the ${role} in the captioned Writ Petition${applicant} and am duly authorised to swear to this Affidavit on behalf of the Petitioner${multi ? "s" : ""}. ${conversant}`;
}

function deponentPreamble(project: DraftoProject): string {
  const d = project.deponent;
  const rel = d.relationship || "son of";
  const father = d.fatherName ? ` ${rel} ${d.fatherName},` : "";
  const age = d.age ? ` aged about ${d.age} years,` : "";
  const addr = d.address ? ` R/o ${d.address},` : "";
  // "presently at" is optional: included only when the deponent's location is set.
  const presentlyAt = d.location?.trim() ? ` presently at ${d.location.trim()},` : "";
  return `I, ${deponentName(project)},${father}${age}${addr}${presentlyAt} do hereby solemnly affirm and declare as under:`;
}

// Right-aligned bold "DEPONENT" signature line.
function deponentLine(): Paragraph {
  return new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [smartTextRun({ text: "DEPONENT", bold: true })] });
}

function buildAffidavitChildren(
  project: DraftoProject,
  kind: "petition" | "cm",
  petHeader: string,
  resHeader: string,
  numbering: any[],
): (Paragraph | Table)[] {
  const affRef = `wpn-aff-${Math.random().toString(36).slice(2, 8)}`;
  numbering.push(decimalDef(affRef));
  const paras: string[] = kind === "petition"
    ? [
        deponentCapacityPara(project, "petition"),
        "The accompanying Writ Petition has been drafted under my instructions and the same has been read over to me and understood by me. I say that the averments made therein are true to the best of my knowledge and belief. Nothing material has been concealed therefrom and no part of it is false.",
        "The submissions concerning the facts are correct to the best of my knowledge based on records, and the submissions made in the Petition, Grounds, Synopsis, List of Dates and other legal submissions are based on legal advice received by me, which I believe to be correct.",
        "The accompanying annexures are true/typed copies of their respective originals or are downloaded from the internet.",
        "I have not preferred any similar or other petition in the aforementioned matter.",
      ]
    : [
        deponentCapacityPara(project, "cm"),
        "The Application has been drafted under my instructions and the same has been read over to me and understood by me. I say that the averments made therein are true to the best of my knowledge and belief. Nothing material has been concealed therefrom and no part of it is false.",
        "The accompanying annexures, if any, are true copies of their respective originals.",
      ];

  // Verification place mirrors the deponent's "presently at": blank underscores
  // when it isn't set, otherwise the entered place.
  const place = project.deponent?.location?.trim() || "_______";
  return [
    ...createWpHeader(project.caseType, { cm: kind === "cm" }),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("AFFIDAVIT", { before: 240 }),
    new Paragraph({ children: [smartTextRun(deponentPreamble(project))] }),
    ...paras.map(t => listItem(affRef, t, { before: 60 })),
    deponentLine(),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 240 }, children: [smartTextRun({ text: "VERIFICATION", bold: true })] }),
    new Paragraph({ children: [smartTextRun(
      `I, ${deponentName(project)}, the deponent above named, hereby verify at ${place} on this ____ day of __________, ${new Date().getFullYear()}, that the contents of the above ${kind === "petition" ? "Petition" : "Application"} are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.`,
    )]}),
    deponentLine(),
  ];
}

// ── Vakalatnama (Delhi HC) ──────────────────────────────────────────────────

export async function generateWpVakalatnama(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  // Fall back to the WP defaults in Settings so the vakalatnama is never left
  // with a blank advocate.
  const advRaw = project.wp.advocate;
  const adv = (advRaw?.name?.trim() || advRaw?.firm?.trim() || advRaw?.address?.trim())
    ? advRaw
    : { ...advRaw, ...getWpFiledBy() };
  const advName = [adv.name, adv.firm].filter(Boolean).join(", ") || "[Advocate]";
  const advDetails = [
    adv.name && { text: adv.name, bold: true },
    adv.enrolmentNo && { text: `Enrl. No.: ${adv.enrolmentNo}` },
    adv.firm && { text: adv.firm },
    adv.address && { text: adv.address },
    adv.email && { text: adv.email },
    adv.phone && { text: adv.phone },
  ].filter(Boolean) as { text: string; bold?: boolean }[];

  // All petitioners execute the vakalatnama (each gets a signature slot below);
  // "X and Ors." from the cause title is never used as an executant.
  const names = (project.petitioners || []).map(p => p.name?.trim()).filter(Boolean) as string[];
  const multi = names.length > 1;
  const executants = names.join("; ") || petHeader;
  const we = multi ? "We" : "I";
  const my = multi ? "our" : "my";

  const authority = [
    "To act, appear and plead in the above-noted case in this Court or in any other Court in which the same may be tried or heard and also in the appellate Court including the High Court.",
    "To sign, file, verify and present pleadings, appeals, cross-objections or petitions for execution, review, revision, withdrawal, compromise or other petitions, replies, objections or affidavits or other documents as may be deemed necessary or proper for the prosecution of the said case in all its stages.",
    "To withdraw or compromise the said case or submit to arbitration any differences or disputes that may arise touching or in any manner relating to the said case.",
    "To deposit, draw and receive moneys and grant receipts therefor and to do all other acts and things which may be necessary to be done for the progress and in the course of the prosecution of the said case.",
    "To appoint and instruct any other legal Practitioner authorising him to exercise the powers and authority hereby conferred upon the Advocate whenever they may think fit to do so.",
  ];

  const nb = numberer();
  const authRef = nb.styled("lower-alpha");

  // Vakalatnama formatting is applied to the PARAGRAPHS and RUNS (not via the
  // document style) so it survives wherever the vakalatnama is emitted.
  const vf = getWpVakFormatting();
  const vSize = Math.round(vf.sizePt * 2);
  const vLine = Math.round(vf.lineSpacing * 240);
  const vAfter = Math.round(vf.afterPt * 20);
  const vSpacing = (before = 0) => ({ line: vLine, after: vAfter, before });
  const vRun = (t: string | { text: string; [k: string]: any }) =>
    smartTextRun(typeof t === "string" ? { text: t, size: vSize } : { ...t, size: vSize });
  const vPara = (opts: { children: any[]; before?: number; alignment?: any }) =>
    new Paragraph({ alignment: opts.alignment, spacing: vSpacing(opts.before ?? 0), children: opts.children });

  const doc = wpDoc([
    ...createWpHeader(project.caseType, { size: vSize }),
    ...createWpPartiesHeader(petHeader, resHeader, { size: vSize }),
    vPara({ alignment: AlignmentType.CENTER, children: [vRun({ text: "VAKALATNAMA", bold: true })], before: 120 }),
    vPara({ children: [vRun(`${we}, ${executants}, the Petitioner${multi ? "s" : ""} in the captioned matter, do hereby appoint ${advName} to be ${my} Advocate in the above-noted case and authorise him:`)] }),
    ...authority.map(t => new Paragraph({ numbering: { reference: authRef, level: 0 }, spacing: vSpacing(), children: [vRun(t)] })),
    vPara({ children: [vRun(`AND ${we.toLowerCase() === "we" ? "we" : "I"} undertake that ${multi ? "we or our" : "I or my"} duly authorised agent will appear in Court on all hearings and will inform the Advocate for appearance when the case is on the date of hearing.`)], before: 80 }),
    vPara({ children: [vRun("Dated: ____________")], before: 160 }),
    vPara({ children: [vRun("Signed, Accepted and Identified by:")] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5000, 5000],
      borders: NO_BORDERS,
      rows: [new TableRow({ children: [
        new TableCell({ children: [
          vPara({ alignment: AlignmentType.LEFT, children: [vRun({ text: "ADVOCATE", bold: true })], before: 240 }),
          ...advDetails.map((d) => vPara({ alignment: AlignmentType.LEFT, children: [vRun(d.bold ? { text: d.text, bold: true } : d.text)] })),
        ], borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP }),
        new TableCell({
          children: multi
            // One signature slot per petitioner, stacked with signing space.
            ? names.map((n, i) => vPara({
                alignment: AlignmentType.RIGHT,
                before: i === 0 ? 240 : 400,
                children: [vRun({ text: `CLIENT (PETITIONER NO. ${i + 1} — ${n})`, bold: true })],
              }))
            : [vPara({ alignment: AlignmentType.RIGHT, before: 240, children: [vRun({ text: "CLIENT", bold: true })] })],
          borders: NO_BORDERS,
          verticalAlign: VerticalAlign.TOP,
        }),
      ]})],
    }),
  ], nb.defs, { vak: true });
  return pack(doc, "WP-Vakalatnama.docx");
}

// ── CM Applications ─────────────────────────────────────────────────────────

// Frozen opening/closing paragraphs shared by every CM (like the SLP IAs). The
// opening para references the writ petition's opening prayer verbatim.
const CM_PARA1 = "The accompanying writ petition has been filed praying that this Hon’ble Court be pleased to grant the reliefs set out therein. The contents of the writ petition are not being repeated here for the sake of brevity and may kindly be treated as part and parcel of this application.";
const CM_GOODFAITH = "This application is filed in good faith and in the interest of justice. No prejudice would be caused to the Respondent(s) if this application were allowed.";

// Standard titles for the three built-in CMs. The user can override each title
// in the Applications tab (empty override = these defaults).
export const WP_STD_CM_TITLES = {
  stay: "Application under Section 151 of the Code of Civil Procedure, 1908 seeking stay of the operation of the Impugned Order",
  lengthySynopsis: "Application under Section 151 of the Code of Civil Procedure, 1908 seeking permission to file a lengthy Synopsis and List of Dates",
  exemptionCopies: "Application under Section 151 of the Code of Civil Procedure, 1908 for exemption from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition",
} as const;

interface CmSpec {
  title: string;
  para2: string;        // "This application is being filed praying that…" (frozen std / editable custom)
  middle: string[];     // editable middle paras the user may insert
  prayers: string[];    // editable prayers; last = residuary placeholder
  annexures: CmAnnexEntry[]; // A-series annexures (custom CMs only)
}

function activeCms(project: DraftoProject): CmSpec[] {
  const cms: CmSpec[] = [];
  const c = project.wp.cms;
  const mid = (arr: { particulars: string }[] | undefined) => (arr || []).map(b => b.particulars).filter(htmlHasText);

  if (project.wp.isIoWrit && c.stay.active) {
    cms.push({
      title: c.stay.title?.trim() || WP_STD_CM_TITLES.stay,
      para2: "This application is being filed praying that this Hon’ble Court be pleased to stay the operation of the Impugned Order during the pendency of the writ petition.",
      middle: mid(c.stay.body),
      prayers: mid(c.stay.prayers),
      annexures: [],
    });
  }
  if (c.lengthySynopsis.active) {
    cms.push({
      title: c.lengthySynopsis.title?.trim() || WP_STD_CM_TITLES.lengthySynopsis,
      para2: "This application is being filed praying that this Hon’ble Court be pleased to permit the Petitioner to file a lengthy Synopsis and List of Dates.",
      middle: mid(c.lengthySynopsis.body),
      prayers: mid(c.lengthySynopsis.prayers),
      annexures: [],
    });
  }
  if (c.exemptionCopies.active) {
    cms.push({
      title: c.exemptionCopies.title?.trim() || WP_STD_CM_TITLES.exemptionCopies,
      para2: "This application is being filed praying that this Hon’ble Court be pleased to exempt the Petitioner from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition.",
      middle: mid(c.exemptionCopies.body),
      prayers: mid(c.exemptionCopies.prayers),
      annexures: [],
    });
  }
  // Custom CMs (SLP custom-IA shape): para2 + grounds (middle) + prayers are all
  // user-editable. Ground annexures become the CM's A-series: a prose sentence
  // is appended to the owning ground para, and the files follow the CM in the
  // Index/PDF.
  (project.wp.customCms || []).forEach(cm => {
    const annexures = cmAnnexureOrder(cm);
    const middle: string[] = [];
    for (const g of cm.grounds || []) {
      const sentences = annexures.filter(e => e.groundId === g.id).map(e => cmAnnexBodySentence(e.aNumber, e.annex));
      if (!htmlHasText(g.particulars) && sentences.length === 0) continue;
      middle.push(appendSentencesToHtml(g.particulars || "", sentences));
    }
    cms.push({
      title: cm.title || "Application",
      para2: cm.para2 || "",
      middle,
      prayers: (cm.prayers || []).map(p => p.particulars).filter(htmlHasText),
      annexures,
    });
  });
  return cms;
}

// The active CM specifications (standard + custom). Exported so the PDF
// assembler can bookmark each CM separately with its full title and interleave
// its A-series annexure files immediately after it.
export function wpActiveCms(project: DraftoProject): { title: string; annexures: CmAnnexEntry[] }[] {
  return activeCms(project).map(c => ({ title: c.title, annexures: c.annexures }));
}

// Bookmark/index title for a CM: "CM Appl. No. ____ of <yr>: <full title>".
export function wpCmTitle(cm: { title: string }): string {
  return `CM Appl. No. ____ of ${new Date().getFullYear()}: ${cm.title}`;
}

// Render one CM in the SLP-IA pattern: frozen opening para → "This application…"
// → editable middle paras → frozen good-faith closing → PRAYERS lead-in →
// editable lettered prayers → filed-by → affidavit. Shared by both generators.
function renderCmChildren(project: DraftoProject, cm: CmSpec, petHeader: string, resHeader: string, nb: ReturnType<typeof numberer>, numbering: any[], includeSignature = false): (Paragraph | Table)[] {
  const num = getWpNumbering();
  const mainRef = nb.decimal();
  return [
    ...createWpHeader(project.caseType, { cm: true }),
    ...createWpPartiesHeader(petHeader, resHeader),
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.JUSTIFIED, indent: { left: 720, right: 720 }, children: [smartTextRun({ text: (cm.title || "").toUpperCase(), bold: true })] }),
    new Paragraph({ children: [smartTextRun("The Petitioner most respectfully submits that:")] }),
    // 1. frozen opening (writ-petition reference)
    listItem(mainRef, CM_PARA1, { before: 60 }),
    // 2. "This application is being filed praying that…"
    ...htmlListItems(mainRef, [cm.para2].filter(htmlHasText), numbering),
    // 3..n editable middle paras
    ...htmlListItems(mainRef, cm.middle, numbering),
    // frozen good-faith / no-prejudice closing
    listItem(mainRef, CM_GOODFAITH, { before: 60 }),
    // PRAYERS lead-in + editable lettered prayers (last = residuary)
    listItemRuns(mainRef, [smartTextRun({ text: "PRAYERS:", bold: true }), " In view of the foregoing averments, it is most respectfully prayed that this Hon’ble Court may be pleased to:"]),
    ...htmlListItems(nb.styled(num.prayers), cm.prayers, numbering),
    ...createWpFiledBy(project, { includeSignature }),
    // CM affidavit
    new Paragraph({ children: [new PageBreak()] }),
    ...buildAffidavitChildren(project, "cm", petHeader, resHeader, numbering),
  ];
}

export async function generateWpCms(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  const cms = activeCms(project);
  if (cms.length === 0) return pack(wpDoc([new Paragraph("")]), "WP-CMs.docx");

  const nb = numberer();
  const numbering = nb.defs;
  const children: (Paragraph | Table)[] = [];
  cms.forEach((cm, idx) => {
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...renderCmChildren(project, cm, petHeader, resHeader, nb, numbering));
  });
  return pack(wpDoc(children, numbering), "WP-CMs.docx");
}

// A single CM as its own docx (used by the PDF assembler for per-CM bookmarks).
export async function generateWpSingleCm(project: DraftoProject, cmIndex: number, includeSignature = false) {
  const { petHeader, resHeader } = partyHeaders(project);
  const cm = activeCms(project)[cmIndex];
  if (!cm) return pack(wpDoc([new Paragraph("")]), `WP-CM-${cmIndex + 1}.docx`);
  const nb = numberer();
  const children = renderCmChildren(project, cm, petHeader, resHeader, nb, nb.defs, includeSignature);
  return pack(wpDoc(children, nb.defs), `WP-CM-${cmIndex + 1}.docx`);
}

// ── Index ───────────────────────────────────────────────────────────────────
// 3-column index (Sr. No. | Particulars | Pg.). `pageRanges` (keyed per item) is
// supplied by the two-pass PDF assembler to back-fill the Pg. column; when
// absent (e.g. the standalone docx export) the column is left blank.

// The ordered index items with their stable keys — shared with the PDF
// assembler so page ranges line up.
// The user-configured order of the reorderable front-matter components, with a
// safety net for missing/duplicated entries.
export function wpFrontMatterOrder(project: DraftoProject): ("notice" | "urgency" | "memo")[] {
  const all: ("notice" | "urgency" | "memo")[] = ["notice", "urgency", "memo"];
  const chosen = (project.wp.frontMatterOrder || []).filter((k, i, a) => all.includes(k) && a.indexOf(k) === i);
  return [...chosen, ...all.filter(k => !chosen.includes(k))];
}

export function wpIndexItems(project: DraftoProject): { key: string; runs: (TextRun | string)[] }[] {
  const year = new Date().getFullYear();
  const frontLabels: Record<"notice" | "urgency" | "memo", string> = {
    notice: "Notice of Motion",
    urgency: "Urgency Application",
    memo: "Memo of Parties",
  };
  const items: { key: string; runs: (TextRun | string)[] }[] = [
    ...wpFrontMatterOrder(project).map(k => ({ key: k, runs: [smartTextRun(frontLabels[k])] })),
    { key: "slod", runs: [smartTextRun("Synopsis and List of Dates")] },
    { key: "petition", runs: [smartTextRun(`Writ Petition under Article ${project.wp.articleBasis} of the Constitution of India, with affidavit.`)] },
  ];
  wpAnnexureOrder(project).forEach(({ annex, pNumber }) => items.push({ key: `annex:${annex.id}`, runs: annexIndexRuns(pNumber, annex) }));
  activeCms(project).forEach((cm, i) => {
    items.push({ key: `cm:${i}`, runs: [smartTextRun({ text: `C.M. No. ____ of ${year}: `, bold: true }), convertToSmartQuotes(cm.title + ", with affidavit.")] });
    // The CM's own A-series annexures sit immediately after it.
    cm.annexures.forEach(({ annex, aNumber }) => items.push({
      key: `cmannex:${annex.id}`,
      runs: [smartTextRun({ text: `${cmAnnexLabel(aNumber)}: `, bold: true }), convertToSmartQuotes(cmAnnexIndexText(annex))],
    }));
  });
  items.push({ key: "vakalatnama", runs: [smartTextRun("Vakalatnama")] });
  items.push({ key: "courtfee", runs: [smartTextRun("Court Fee")] });
  items.push({ key: "proofofservice", runs: [smartTextRun("Proof of Service")] });
  return items;
}

export async function generateWpIndex(project: DraftoProject, pageRanges?: Record<string, string>, includeSignature = false) {
  const { petHeader, resHeader } = partyHeaders(project);
  const items = wpIndexItems(project);

  const headerRow = new TableRow({ children: [
    new TableCell({ children: [centeredBoldCell("Sr. No.")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [centeredBoldCell("Particulars")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [centeredBoldCell("Pg.")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
  ]});

  const rows = items.map((it, i) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER, spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ children: it.runs.map(r => (typeof r === "string" ? smartTextRun(r) : r)), spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ text: pageRanges?.[it.key] ?? "", alignment: AlignmentType.CENTER, spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
  ]}));

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1000, 7500, 1500], rows: [headerRow, ...rows] });

  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("INDEX", { before: 240 }),
    table,
    new Paragraph({ spacing: { line: 240, before: 240, after: 120 }, children: [
      smartTextRun({ text: "Note: ", bold: true }),
      smartTextRun("The Petition has been duly bookmarked and an OCR version of the same has been served upon all the parties."),
    ]}),
    ...createWpFiledBy(project, { includeSignature }),
  ]);
  return pack(doc, "WP-Index.docx");
}

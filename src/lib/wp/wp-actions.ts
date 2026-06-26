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
  wpMargins,
  NO_BORDERS,
  partyPosition,
} from "./wp-helpers";
import { cascadeFor, type EnumStyle } from "./wp-numbering";
import { wpAnnexureOrder, annexLabel } from "./wp-annexures";
import { getWpNumbering } from "./wp-settings";

const cellMargins = { top: 0, bottom: 0, left: 115, right: 115 };
const tableSpacing = { before: 120, after: 120 };

// ── Shared utilities ────────────────────────────────────────────────────────

function partyHeaders(project: DraftoProject) {
  return {
    petHeader: getPartyHeader(project.petitioners) || "[Petitioner]",
    resHeader: getPartyHeader(project.respondents) || "[Respondents]",
  };
}

function wpDoc(children: (Paragraph | Table)[], numbering?: any[]) {
  return new Document({
    styles: getWpStyles(),
    ...(numbering && numbering.length ? { numbering: { config: numbering } } : {}),
    sections: [{
      properties: { page: { margin: wpMargins } },
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

export async function generateWpNoticeOfMotion(project: DraftoProject) {
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
    ...createWpFiledBy(project),
  ]);
  return pack(doc, "WP-NoticeOfMotion.docx");
}

// ── Urgency Application ─────────────────────────────────────────────────────

export async function generateWpUrgencyApplication(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("URGENCY APPLICATION", { before: 360 }),
    ...createSalutation(["To", "The Deputy Registrar,", "Delhi High Court."]),
    new Paragraph({ children: [smartTextRun("Sir,")] }),
    new Paragraph({ children: [smartTextRun("For the reasons stated in the accompanying writ petition, the same may be listed before the Hon’ble Court urgently as per the applicable rules.")] }),
    ...createWpFiledBy(project),
  ]);
  return pack(doc, "WP-UrgencyApplication.docx");
}

// ── Memo of Parties ─────────────────────────────────────────────────────────

export async function generateWpMemoOfParties(project: DraftoProject) {
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
    ...createWpFiledBy(project),
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
// Single source of truth. The last entry is the residuary prayer, included only
// in the final Prayers block (para 8). When IO, relief (a) auto-quashes the IO.

function reliefStrings(project: DraftoProject): { top: string[]; all: string[] } {
  const items = (project.wp.reliefs || []).map(r => r.particulars || "").filter(htmlHasText);
  // Drop the residuary (last) item for the "top" block and the intro.
  const top = items.length > 1 ? items.slice(0, -1) : items;

  if (project.wp.isIoWrit) {
    const ioEntry = wpAnnexureOrder(project).find(e => e.annex.isImpugnedOrder);
    let ioDesc: string;
    if (ioEntry) {
      const t = ioEntry.annex.title || "Impugned Order";
      // Avoid "the the …" when the title already begins with an article.
      const article = /^(the|a|an)\s/i.test(t) ? "" : "the ";
      const dated = ioEntry.annex.date ? ` dated ${ioEntry.annex.date}` : "";
      ioDesc = `Quash and set aside ${article}${t}${dated} [${annexLabel(ioEntry.pNumber, ioEntry.annex)}]`;
    } else {
      ioDesc = "Quash and set aside the Impugned Order [Annexure P-1]";
    }
    return { top: [ioDesc, ...top], all: [ioDesc, ...items] };
  }
  return { top, all: items };
}

// ── Writ Petition (body + affidavit) ────────────────────────────────────────

export async function generateWpPetition(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  const article = project.wp.articleBasis;
  const { top, all } = reliefStrings(project);

  const num = getWpNumbering();
  const nb = numberer();
  const numbering = nb.defs;

  const mainRef = nb.decimal();              // top-level 1.–8.
  const reliefsTopRef = nb.styled(num.prayers);
  const groundsRef = nb.styled(num.grounds);
  const prayersRef = nb.styled(num.prayers);

  const facts = parseHtml(project.wp.facts || "");
  applyFactsCascade(facts.numbering, num.facts);
  numbering.push(...facts.numbering);

  const groundStrings = (project.grounds || []).map(g => g.particulars).filter(htmlHasText);

  const children: (Paragraph | Table)[] = [
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold(`Writ Petition under Article ${article} of the Constitution of India`, { before: 240 }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("PRAYING FOR THE FOLLOWING RELIEFS:")] }),
    ...htmlListItems(reliefsTopRef, top, numbering),
    // Salutation (indented, italic)
    ...createSalutation(["To", "The Hon’ble Chief Justice of the Delhi High Court", "And His Companion Justices of the Hon’ble High Court of Delhi"]),
    new Paragraph({ children: [smartTextRun({ text: "The Petitioner most respectfully submits that:", bold: true })] }),
    // 1. Intro
    listItem(mainRef, "This Writ Petition is filed praying for the reliefs set out hereinabove.", { before: 120 }),
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
    ...htmlListItems(prayersRef, all, numbering),
    ...createWpFiledBy(project),
    // Affidavit (the index lists the petition "with affidavit")
    new Paragraph({ children: [new PageBreak()] }),
    ...buildAffidavitChildren(project, "petition", petHeader, resHeader, numbering),
  ];

  return pack(wpDoc(children, numbering), "WP-Petition.docx");
}

// ── Affidavit (shared by the petition and CMs) ──────────────────────────────

// The deponent defaults to the sole/first petitioner's name when not set.
function deponentName(project: DraftoProject): string {
  return project.deponent?.name?.trim() || project.petitioners?.[0]?.name?.trim() || "[Deponent]";
}

function deponentPreamble(project: DraftoProject): string {
  const d = project.deponent;
  const rel = d.relationship || "son of";
  const father = d.fatherName ? ` ${rel} ${d.fatherName},` : "";
  const age = d.age ? ` aged about ${d.age} years,` : "";
  const addr = d.address ? ` R/o ${d.address},` : "";
  return `I, ${deponentName(project)},${father}${age}${addr} do hereby solemnly affirm and declare as under:`;
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
        "I am the Petitioner in the captioned Writ Petition. I am fully conversant with the facts of the case and hence competent to swear to this Affidavit.",
        "The accompanying Writ Petition has been drafted under my instructions and the same has been read over to me and understood by me. I say that the averments made therein are true to the best of my knowledge and belief. Nothing material has been concealed therefrom and no part of it is false.",
        "The submissions concerning the facts are correct to the best of my knowledge based on records, and the submissions made in the Petition, Grounds, Synopsis, List of Dates and other legal submissions are based on legal advice received by me, which I believe to be correct.",
        "The accompanying annexures are true/typed copies of their respective originals or are downloaded from the internet.",
        "I have not preferred any similar or other petition in the aforementioned matter.",
      ]
    : [
        "I am the Petitioner in the captioned Writ Petition and the Applicant in the present Application. I am fully conversant with the facts of the case and hence competent to swear to this Affidavit.",
        "The Application has been drafted under my instructions and the same has been read over to me and understood by me. I say that the averments made therein are true to the best of my knowledge and belief. Nothing material has been concealed therefrom and no part of it is false.",
        "The accompanying annexures, if any, are true copies of their respective originals.",
      ];

  const place = project.advocate.filingPlace || "New Delhi";
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
  const adv = project.wp.advocate;
  const advLine = [adv.name, adv.firm, adv.address, adv.enrolmentNo ? `Enrl. No.: ${adv.enrolmentNo}` : "", [adv.email, adv.phone].filter(Boolean).join(" | ")].filter(Boolean).join(", ");

  const authority = [
    "To act, appear and plead in the above-noted case in this Court or in any other Court in which the same may be tried or heard and also in the appellate Court including the High Court.",
    "To sign, file, verify and present pleadings, appeals, cross-objections or petitions for execution, review, revision, withdrawal, compromise or other petitions, replies, objections or affidavits or other documents as may be deemed necessary or proper for the prosecution of the said case in all its stages.",
    "To withdraw or compromise the said case or submit to arbitration any differences or disputes that may arise touching or in any manner relating to the said case.",
    "To deposit, draw and receive moneys and grant receipts therefor and to do all other acts and things which may be necessary to be done for the progress and in the course of the prosecution of the said case.",
    "To appoint and instruct any other legal Practitioner authorising him to exercise the powers and authority hereby conferred upon the Advocate whenever they may think fit to do so.",
  ];

  const nb = numberer();
  const authRef = nb.styled("lower-alpha");

  const doc = wpDoc([
    ...createWpHeader(project.caseType),
    ...createWpPartiesHeader(petHeader, resHeader),
    centeredBold("VAKALATNAMA", { before: 240 }),
    new Paragraph({ children: [smartTextRun(`I, ${petHeader}, the Petitioner in the captioned matter, do hereby appoint ${advLine || "[Advocate]"} to be my Advocate in the above-noted case and authorise him:`)] }),
    ...authority.map(t => listItem(authRef, t, { before: 60 })),
    new Paragraph({ spacing: { before: 120 }, children: [smartTextRun("AND I undertake that I or my duly authorised agent will appear in Court on all hearings and will inform the Advocate for appearance when the case is on the date of hearing.")] }),
    new Paragraph({ spacing: { before: 240 }, children: [smartTextRun("Dated: ____________")] }),
    new Paragraph({ children: [smartTextRun("Signed, Accepted and Identified by:")] }),
    new Paragraph({ spacing: { before: 360 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [5000, 5000],
      borders: NO_BORDERS,
      rows: [new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [smartTextRun({ text: "ADVOCATE", bold: true })] })], borders: NO_BORDERS }),
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "CLIENT", bold: true })] })], borders: NO_BORDERS }),
      ]})],
    }),
  ], nb.defs);
  return pack(doc, "WP-Vakalatnama.docx");
}

// ── CM Applications ─────────────────────────────────────────────────────────

interface CmSpec {
  title: string;
  body: string[];
  prayers: string[];
  grounds?: { particulars: string }[];
}

function activeCms(project: DraftoProject): CmSpec[] {
  const cms: CmSpec[] = [];
  if (project.wp.isIoWrit && project.wp.cms.stay.active) {
    cms.push({
      title: "Application under Order XXXIX Rules 1 and 2 read with Section 151 of the Code of Civil Procedure, 1908 seeking stay of the operation of the Impugned Order",
      body: [
        "The contents of the accompanying writ petition may kindly be treated as part and parcel of this Application and are not being repeated herein for the sake of brevity.",
        "The Petitioner has a strong prima facie case and the balance of convenience lies in favour of the Petitioner. Irreparable injury would be caused to the Petitioner if the operation of the Impugned Order is not stayed during the pendency of the writ petition.",
      ],
      grounds: project.wp.cms.stay.grounds?.filter(g => g.particulars?.trim()),
      prayers: [
        "Stay the operation of the Impugned Order during the pendency of the present writ petition; and",
        "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case.",
      ],
    });
  }
  if (project.wp.cms.lengthySynopsis.active) {
    cms.push({
      title: "Application under Section 151 of the Code of Civil Procedure, 1908 seeking permission to file a lengthy Synopsis and List of Dates",
      body: [
        "The contents of the accompanying writ petition may kindly be treated as part and parcel of this Application.",
        "By way of the present Application, the Petitioner prays that he be permitted to file a lengthy Synopsis and List of Dates in view of the complex and intricate set of facts in this case. Only those facts essential to the present Petition have been detailed therein.",
        "No prejudice will be caused to the Respondents if the present Application is allowed. This Application is filed in good faith and in the interest of justice.",
      ],
      prayers: [
        "Exempt the Petitioner from complying with the applicable rules pertaining to filing a brief Synopsis and List of Dates and permit the filing of a lengthy Synopsis and List of Dates; and",
        "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case.",
      ],
    });
  }
  if (project.wp.cms.exemptionCopies.active) {
    cms.push({
      title: "Application under Section 151 of the Code of Civil Procedure, 1908 for exemption from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition",
      body: [
        "The captioned writ petition is being filed on an urgent basis and in view of a lengthy and complex set of facts and circumstances.",
        "The Petitioner prays that this Hon’ble Court exempt the Petitioner from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition. The Petitioner undertakes to furnish clear/typed copies if directed by this Hon’ble Court.",
        "No prejudice will be caused to the Respondents if this Application is allowed. This Application has been made bona fide and in the interest of justice.",
      ],
      prayers: [
        "Exempt the Petitioner from filing legible/clear copies, certified copies or true typed copies of the annexures to the writ petition; and",
        "Pass any such other order(s) as this Hon’ble Court may deem fit in the facts and circumstances of this case.",
      ],
    });
  }
  // User-defined custom CMs (reusing the SLP custom-IA shape). Grounds and
  // prayers are rich text (HTML); the body is the standard part-and-parcel line
  // plus the optional para-2 free text.
  (project.wp.customCms || []).forEach(cm => {
    cms.push({
      title: cm.title || "Application",
      body: [
        "The contents of the accompanying writ petition may kindly be treated as part and parcel of this Application.",
        ...(cm.para2?.trim() ? [cm.para2] : []),
      ],
      grounds: (cm.grounds || []).map(g => ({ particulars: g.particulars })).filter(g => htmlHasText(g.particulars)),
      prayers: (cm.prayers || []).map(p => p.particulars).filter(htmlHasText),
    });
  });
  return cms;
}

// The active CM specifications (standard + custom). Exported so the PDF
// assembler can bookmark each CM separately with its full title.
export function wpActiveCms(project: DraftoProject): { title: string }[] {
  return activeCms(project).map(c => ({ title: c.title }));
}

// Bookmark/index title for a CM: "CM Appl. No. ____ of <yr>: <full title>".
export function wpCmTitle(cm: { title: string }): string {
  return `CM Appl. No. ____ of ${new Date().getFullYear()}: ${cm.title}`;
}

// Render one CM (header → body → grounds → prayer → filed-by → affidavit) into
// the given numberer. Shared by the combined and single-CM generators.
function renderCmChildren(project: DraftoProject, cm: CmSpec, petHeader: string, resHeader: string, nb: ReturnType<typeof numberer>, numbering: any[]): (Paragraph | Table)[] {
  const num = getWpNumbering();
  const mainRef = nb.decimal();
  const children: (Paragraph | Table)[] = [
    ...createWpHeader(project.caseType, { cm: true }),
    ...createWpPartiesHeader(petHeader, resHeader),
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.JUSTIFIED, indent: { left: 720, right: 720 }, children: [smartTextRun({ text: (cm.title || "").toUpperCase(), bold: true })] }),
    new Paragraph({ children: [smartTextRun("The Petitioner most respectfully submits that:")] }),
    ...cm.body.map(t => listItem(mainRef, t, { before: 60 })),
  ];
  const groundStrings = (cm.grounds || []).map(g => g.particulars).filter(htmlHasText);
  if (groundStrings.length) {
    children.push(listItem(mainRef, "GROUNDS", { bold: true, before: 120 }));
    children.push(...htmlListItems(nb.styled(num.grounds), groundStrings, numbering));
  }
  children.push(listItemRuns(mainRef, [smartTextRun({ text: "PRAYER:", bold: true }), " In view of the foregoing submissions, the Petitioner most respectfully prays that this Hon’ble Court may be pleased to:"]));
  children.push(...htmlListItems(nb.styled(num.prayers), cm.prayers, numbering));
  children.push(...createWpFiledBy(project));
  // CM affidavit
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(...buildAffidavitChildren(project, "cm", petHeader, resHeader, numbering));
  return children;
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
export async function generateWpSingleCm(project: DraftoProject, cmIndex: number) {
  const { petHeader, resHeader } = partyHeaders(project);
  const cm = activeCms(project)[cmIndex];
  if (!cm) return pack(wpDoc([new Paragraph("")]), `WP-CM-${cmIndex + 1}.docx`);
  const nb = numberer();
  const children = renderCmChildren(project, cm, petHeader, resHeader, nb, nb.defs);
  return pack(wpDoc(children, nb.defs), `WP-CM-${cmIndex + 1}.docx`);
}

// ── Index ───────────────────────────────────────────────────────────────────
// 3-column index (Sr. No. | Particulars | Pg.). Page numbers are filled at
// PDF-generation time, so the Pg. column is left blank here.

export async function generateWpIndex(project: DraftoProject) {
  const { petHeader, resHeader } = partyHeaders(project);
  const year = new Date().getFullYear();

  const particulars: (TextRun | string)[][] = [
    [smartTextRun("Notice of Motion")],
    [smartTextRun("Urgency Application")],
    [smartTextRun("Memo of Parties")],
    [smartTextRun("Synopsis and List of Dates")],
    [smartTextRun(`Writ Petition under Article ${project.wp.articleBasis} of the Constitution of India, with affidavit.`)],
  ];
  wpAnnexureOrder(project).forEach(({ annex, pNumber }) => particulars.push(annexIndexRuns(pNumber, annex)));
  activeCms(project).forEach(cm => particulars.push([smartTextRun({ text: `C.M. No. ____ of ${year}: `, bold: true }), convertToSmartQuotes(cm.title + ", with affidavit.")]));
  particulars.push([smartTextRun("Vakalatnama")]);
  particulars.push([smartTextRun("Court Fee")]);
  particulars.push([smartTextRun("Proof of Service")]);

  const headerRow = new TableRow({ children: [
    new TableCell({ children: [centeredBoldCell("Sr. No.")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [centeredBoldCell("Particulars")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [centeredBoldCell("Pg.")], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
  ]});

  const rows = particulars.map((runs, i) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER, spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ children: runs.map(r => (typeof r === "string" ? smartTextRun(r) : r)), spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ text: "", alignment: AlignmentType.CENTER, spacing: tableSpacing })], verticalAlign: VerticalAlign.CENTER, margins: cellMargins }),
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
    ...createWpFiledBy(project),
  ]);
  return pack(doc, "WP-Index.docx");
}

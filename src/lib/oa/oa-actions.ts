// Central Administrative Tribunal — Original Application document generators.
// Reuses the exported WP docx helpers (styles, margins, Filed-by, annexure
// sentences, numbering primitives) and adds the OA header, parties table, the
// fixed 12-paragraph body, MAs, Petition for Transfer, affidavits, vakalatnama,
// authority letters, per-applicant last pages, index — and a combined
// "everything" document.

import {
  Packer, Document, Header, Footer, Paragraph, PageBreak, AlignmentType,
  Table, TableRow, TableCell, WidthType, VerticalAlign,
} from "docx";
import { getPartyHeader, smartTextRun } from "@/lib/docx-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import type { DraftoProject } from "@/lib/schema";
import { createWpFiledBy, NO_BORDERS } from "@/lib/wp/wp-helpers";
import { cascadeFor, enumLabel, type EnumStyle } from "@/lib/wp/wp-numbering";
import { wpAnnexureOrder } from "@/lib/wp/wp-annexures";
import { factsAnnexureSentenceHtml, inlineHtml } from "@/lib/wp/wp-facts";
import { oaBench } from "@/lib/oa/oa-benches";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { getOaFiledBy, getOaFiledByLayout, getOaFiledByLeftPct, getOaSignature, getOaMarginsIn, getOaOutputFormatting, getOaVakFormatting, getOaForceLastPageBreak } from "@/lib/oa/oa-settings";

type Child = Paragraph | Table;
type OaMa = DraftoProject["oa"]["mas"][number];

const RESIDUARY = "Pass such other/further orders as this Hon’ble Tribunal may deem fit and proper in the facts and circumstances of the case.";

// ── scaffolding ──────────────────────────────────────────────────────────────
// Page margins from Settings → Original Application (independent of WP).
function oaMargins() {
  const m = getOaMarginsIn();
  return {
    top: Math.round(m.top * 1440),
    right: Math.round(m.right * 1440),
    bottom: Math.round(m.bottom * 1440),
    left: Math.round(m.left * 1440),
  };
}

// Body styles from Settings → Original Application. `vak` switches to the
// vakalatnama's own (smaller, single-spaced) formatting so it fits one page.
function oaStyles(vak = false) {
  const f = getOaOutputFormatting();
  const v = getOaVakFormatting();
  const sizePt = vak ? v.sizePt : f.sizePt;
  const lineSpacing = vak ? v.lineSpacing : f.lineSpacing;
  const afterPt = vak ? v.afterPt : f.afterPt;
  const beforePt = vak ? 0 : f.beforePt;
  return {
    paragraphStyles: [{
      id: "Normal", name: "Normal", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { font: f.font, size: Math.round(sizePt * 2) },
      paragraph: {
        spacing: { line: Math.round(lineSpacing * 240), after: Math.round(afterPt * 20), before: Math.round(beforePt * 20) },
        alignment: AlignmentType.JUSTIFIED,
      },
    }],
  };
}

function oaDoc(children: Child[], numbering?: any[], opts?: { vak?: boolean }) {
  return new Document({
    styles: oaStyles(opts?.vak),
    ...(numbering && numbering.length ? { numbering: { config: numbering } } : {}),
    sections: [{ properties: { page: { margin: oaMargins() } }, headers: { default: new Header({ children: [] }) }, footers: { default: new Footer({ children: [] }) }, children }],
  });
}
async function pack(doc: Document, fileName: string) {
  return { success: true as const, docx: await Packer.toBase64String(doc), fileName };
}
// Split a rich-text ordered list into its top-level <li> items (depth-aware, so
// nested lists inside an item stay with that item). Anything that isn't a list
// comes back as a single item, so hand-written Facts still generate.
function splitListItems(html: string): string[] {
  const src = html || "";
  const items: string[] = [];
  const re = /<\/?li\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let depth = 0;
  let start = -1;
  while ((m = re.exec(src))) {
    const isOpen = !m[0].startsWith("</");
    if (isOpen) {
      if (depth === 0) start = m.index + m[0].length;
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        items.push(src.slice(start, m.index));
        start = -1;
      }
    }
  }
  if (!items.length) {
    const plain = src.trim();
    return plain ? [plain] : [];
  }
  return items.filter((i) => htmlHasText(i));
}

function htmlHasText(html?: string): boolean {
  return !!(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim();
}

// ── numbering ────────────────────────────────────────────────────────────────
type OaStyle = "decimal-sub" | EnumStyle;
let seq = 0;
const newRef = () => `oan-${seq++}`;
// Sub-list indents: the label sits at 600 twips (just past the parent's text at
// 480) and the text starts at 1200, leaving room for wide labels like "4.10".
const SUB_LEFT = 1200;
const SUB_HANG = 600;
// Quote indents inside OA lists follow the same geometry: level L text sits at
// (720 + L*480), i.e. SUB_LEFT at the first level.
const OA_LIST_GEOM = { base: 720, step: 480 };
function listDef(reference: string, style: OaStyle, parentNum?: number) {
  if (style === "decimal-sub") {
    const deeper = cascadeFor("lower-alpha");
    return { reference, levels: [
      { level: 0, format: "decimal", text: `${parentNum ?? 1}.%1`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: SUB_LEFT, hanging: SUB_HANG } } } },
      ...deeper.map((fmt, i) => ({ level: i + 1, format: fmt, text: `%${i + 2})`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: SUB_LEFT + (i + 1) * 480, hanging: SUB_HANG } } } })),
    ] };
  }
  const cascade = cascadeFor(style);
  return { reference, levels: cascade.map((fmt, i) => ({ level: i, format: fmt, text: `%${i + 1})`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: SUB_LEFT + i * 480, hanging: SUB_HANG } } } })) };
}
function decimalDef(reference: string, start = 1) {
  return { reference, levels: [{ level: 0, format: "decimal", text: "%1.", start, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 480, hanging: 480 } } } }] };
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// One auto-numbered top-level OA paragraph: "N. Heading: <body>". Built as HTML
// and parsed so inline formatting (bold, highlights) in the body survives and
// everything stays inside a SINGLE Word-numbered paragraph.
function oaPara(mainRef: string, heading: string, bodyHtml: string, numbering: any[]): Paragraph[] {
  const html = `<p><b>${esc(heading)}:</b> ${bodyHtml}</p>`;
  const parsed = parseHtml(html, { before: 140 }, { reference: mainRef, level: 0 }, OA_LIST_GEOM);
  if (parsed.numbering.length) numbering.push(...parsed.numbering);
  return parsed.paragraphs;
}
function listItem(reference: string, text: string, before = 60): Paragraph {
  return new Paragraph({ numbering: { reference, level: 0 }, spacing: { before }, children: [smartTextRun(text)] });
}
function htmlListItems(reference: string, items: string[], collect: any[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const html of items) {
    const parsed = parseHtml(html || "", undefined, { reference, level: 0 }, OA_LIST_GEOM);
    if (parsed.numbering.length) collect.push(...parsed.numbering);
    out.push(...parsed.paragraphs);
  }
  return out;
}

// ── plurals ──────────────────────────────────────────────────────────────────
function plurals(project: DraftoProject) {
  const names = (project.petitioners || []).map((p) => p.name?.trim()).filter(Boolean) as string[];
  const multi = names.length > 1;
  return { names, count: names.length, multi, Appl: multi ? "Applicants" : "Applicant", appl: multi ? "applicants" : "applicant", declares: multi ? "declare" : "declares", prays: multi ? "pray" : "prays", is: multi ? "are" : "is", have: multi ? "have" : "has", they: multi ? "they" : "he", them: multi ? "them" : "him" };
}

// ── header + parties ─────────────────────────────────────────────────────────
function centered(text: string, o?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240, after: 240 }, children: [smartTextRun({ text, bold: o?.bold, italics: o?.italics })] });
}

// Document titles (OA / MA / PT) are justified within a 0.5" left+right indent
// rather than centred.
function docTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 720, right: 720 },
    spacing: { line: 240, before: 120, after: 240 },
    children: [smartTextRun({ text, bold: true })],
  });
}
export function createOaHeader(prefix?: Paragraph[]): Paragraph[] {
  const year = new Date().getFullYear();
  const bench = oaBench(getSettings().oaBench);
  return [
    centered("BEFORE THE CENTRAL ADMINISTRATIVE TRIBUNAL", { bold: true }),
    centered(bench.header, { italics: true }),
    ...(prefix ?? []),
    centered(`Original Application No. _____ of ${year}`, { bold: true }),
  ];
}
function maHeaderPrefix(kind: OaMa["kind"]): Paragraph[] {
  const year = new Date().getFullYear();
  const label = kind === "pt" ? "Petition for Transfer" : "Miscellaneous Application";
  return [centered(`${label} No. _____ of ${year}`, { bold: true }), centered("in", { bold: true })];
}
function createOaPartiesHeader(project: DraftoProject): Child[] {
  const petHeader = getPartyHeader(project.petitioners) || "[Applicant]";
  const resHeader = getPartyHeader(project.respondents) || "[Respondents]";
  const applLabel = plurals(project).multi ? "…Applicants" : "…Applicant";
  const out: Child[] = [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [smartTextRun({ text: "IN THE MATTER OF:", smallCaps: true })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [6300, 3700], borders: NO_BORDERS, rows: [
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [smartTextRun(petHeader)] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun(applLabel)] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
      ] }),
      new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text: "Versus", italics: true })] })], borders: NO_BORDERS })] }),
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [smartTextRun(resHeader)] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun("…Respondents")] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER }),
      ] }),
    ] }),
  ];
  if (project.oa.legalAid) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [smartTextRun({ text: "[LEGAL AID CASE BY DELHI STATE LEGAL SERVICES AUTHORITY]", bold: true, allCaps: true })] }));
  return out;
}

// ── reliefs ──────────────────────────────────────────────────────────────────
function reliefStrings(project: DraftoProject): string[] {
  const items = (project.oa.reliefs || []).map((r) => r.particulars).filter(htmlHasText);
  return [...items, `<p>${RESIDUARY}</p>`];
}
function oaPrayersInline(project: DraftoProject): string {
  const style = project.oa.numbering.prayer as EnumStyle;
  return reliefStrings(project).map((r, i) => `[${enumLabel(i, style)}] ${inlineHtml(r)}`).join(" ");
}

// ── deponent / verification ──────────────────────────────────────────────────
function deponentFor(project: DraftoProject, applicantIdx?: number) {
  const d = project.deponent || ({} as any);
  const name = applicantIdx != null ? (project.petitioners?.[applicantIdx]?.name?.trim() || `[Applicant No. ${applicantIdx + 1}]`) : (d.name?.trim() || project.petitioners?.[0]?.name?.trim() || "[Deponent]");
  return { name, rel: d.relationship || "son of", father: d.fatherName || "____", age: d.age || "__", address: d.address || "____", place: d.location?.trim() || "____" };
}
// The shared deponent dropdown is worded for the Supreme Court ("Petitioner…").
// Before a tribunal the same person is the Applicant.
function oaDeponentRole(project: DraftoProject): string {
  const role = project.deponent?.role?.trim() || "Applicant";
  return role.replace(/Petitioners/g, "Applicants").replace(/Petitioner/g, "Applicant");
}

function deponentLine(applicantIdx?: number): Paragraph {
  return new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [smartTextRun({ text: `DEPONENT${applicantIdx != null ? ` (Applicant No. ${applicantIdx + 1})` : ""}`, bold: true })] });
}

// ── the OA body ──────────────────────────────────────────────────────────────
// Advocate details for the Filed-by block: the per-case values, falling back to
// the CAT defaults in Settings when the case hasn't overridden them.
// The OA "Filed by" block — same renderer as the WP one, but driven by the CAT
// layout / column split / signature settings.
function oaFiledBy(project: DraftoProject, opts?: { includeSignature?: boolean }): Child[] {
  return createWpFiledBy(project, {
    advocate: oaAdvocate(project),
    layout: getOaFiledByLayout(),
    leftPct: getOaFiledByLeftPct(),
    signature: getOaSignature(),
    includeSignature: opts?.includeSignature,
  });
}

function oaAdvocate(project: DraftoProject) {
  const a = project.oa.advocate;
  if (a?.name?.trim() || a?.firm?.trim() || a?.address?.trim()) return a;
  return { ...a, ...getOaFiledBy() };
}

// Paras 1–9 (no last page). `mainRef` carries the automatic 1…12 numbering.
function buildOaBody(project: DraftoProject, numbering: any[], mainRef: string): Child[] {
  const p = plurals(project);
  const num = project.oa.numbering;
  const reliefs = reliefStrings(project);

  // Impugned-order annexure sentences, appended INSIDE Para 1.
  const ioHtml = wpAnnexureOrder(project)
    .filter((e) => e.annex.isImpugnedOrder)
    .map((e) => factsAnnexureSentenceHtml(e.pNumber, e.annex, "A"))
    .join(" ");

  // Facts use the SAME mechanism as Grounds — each item parsed on its own and
  // bound to one numbering reference — so both lists indent identically.
  const factStrings = splitListItems(project.oa.facts || "");
  const factsRef = newRef(); numbering.push(listDef(factsRef, num.facts as OaStyle, 4));

  const groundStrings = (project.grounds || []).map((g) => g.particulars).filter(htmlHasText);
  const groundsRef = newRef(); numbering.push(listDef(groundsRef, num.grounds as OaStyle, 5));
  const prayerRef = newRef(); numbering.push(listDef(prayerRef, num.prayer as OaStyle));
  const interimRef = newRef(); numbering.push(listDef(interimRef, num.interim as OaStyle));
  const interimStrings = [...(project.oa.interimReliefs || []).map((r) => r.particulars).filter(htmlHasText), `<p>${RESIDUARY}</p>`];

  // Para 2 — one flowing paragraph (each ticked declaration is a sentence).
  const note = (n: string) => (n?.trim() ? " " + esc(n.trim()) : "");
  const jurSentences: string[] = [];
  if (project.oa.jurisdictionPosted) jurSentences.push(`The ${p.Appl} ${p.declares} that the ${p.Appl} ${p.is} posted for the time being within the jurisdiction of this Hon’ble Tribunal.${note(project.oa.jurisdictionPostedNote)}`);
  if (project.oa.jurisdictionCause) jurSentences.push(`The ${p.Appl} ${p.declares} that the cause of action of the present OA arose within the jurisdiction of this Hon’ble Tribunal.${note(project.oa.jurisdictionCauseNote)}`);
  if (!jurSentences.length) jurSentences.push(`This OA is accompanied by an application under Section 25 of the Administrative Tribunals Act, 1985 read with Rule 6 of the CAT (Procedure) Rules, 1987 seeking leave of the Hon’ble Chairman to file this OA before the Registrar, ${esc(oaBench(getSettings().oaBench).name)}.`);
  const jurHtml = jurSentences.join(" ");

  const NO_DELAY = `The ${p.Appl} ${p.declares} that there is no delay in filing of the present OA and the same is within limitation.`;
  let limitation: string;
  if (project.oa.limitation === "delay") {
    const d = project.oa.delayDays?.trim() || "__";
    limitation = `The ${p.Appl} ${p.declares} that there is a delay of ${d} days in filing of this OA and an application for condonation of delay of the said period is being filed along with this OA.`;
  } else if (project.oa.limitation === "abundantCaution") {
    limitation = `${NO_DELAY} However, by way of abundant caution and without prejudice to the ${p.Appl}${p.multi ? "’" : "’s"} aforesaid stance, an application for condonation of delay is being filed along with this OA.`;
  } else if (project.oa.limitation === "custom") {
    limitation = project.oa.limitationCustom?.trim() || "[Limitation]";
  } else {
    limitation = NO_DELAY;
  }
  if (project.oa.limitationNote?.trim()) limitation += " " + project.oa.limitationNote.trim();

  return [
    ...createOaHeader(),
    ...createOaPartiesHeader(project),
    docTitle("ORIGINAL APPLICATION UNDER SECTION 19 OF THE ADMINISTRATIVE TRIBUNALS ACT, 1985"),
    new Paragraph({ spacing: { before: 120 }, children: [smartTextRun({ text: "The Applicant most respectfully submits that:", bold: true })] }),
    // 1 — prayers inline, then the impugned-order annexure sentences, all in one para.
    ...oaPara(mainRef, "Particulars of the Order(s) against which this OA has been filed",
      `By this Original Application, the ${p.Appl} ${p.prays} that this Hon’ble Tribunal may be pleased to ${oaPrayersInline(project)}${ioHtml ? " " + ioHtml : ""}`, numbering),
    ...oaPara(mainRef, "Jurisdiction", jurHtml, numbering),
    ...oaPara(mainRef, "Limitation", esc(limitation), numbering),
    ...oaPara(mainRef, "Facts", "The facts of the case which are necessary for the adjudication of the present Original Application are as under:", numbering),
    ...(factStrings.length ? htmlListItems(factsRef, factStrings, numbering) : [new Paragraph({ children: [smartTextRun("[Facts — generate from the List of Dates.]")] })]),
    ...oaPara(mainRef, "Grounds", "This Original Application is being filed on the following grounds which are taken without prejudice to each other:", numbering),
    ...htmlListItems(groundsRef, groundStrings, numbering),
    ...oaPara(mainRef, "Details of remedies exhausted", esc(`The ${p.Appl} ${p.declares} that ${p.they} ${p.have} availed of all the remedies available to ${p.them} under the relevant provisions before approaching this Tribunal, and that no remedies are available to ${p.them} now other than filing this Original Application before this Hon’ble Tribunal.`), numbering),
    ...oaPara(mainRef, "Matters not previously filed / pending with any other court", esc(`The ${p.Appl} ${p.declares} that ${p.they} ${p.have} not previously filed any Application, Petition, or Suit, regarding the matter in respect of which the present OA has been filed, before any Court or other authority or any other Bench of the Tribunal, nor any such Application, Writ Petition or Suit is pending before any court or tribunal, except those, if any, stated in Para 4 above.`), numbering),
    ...oaPara(mainRef, "Prayers", "In view of the foregoing submissions, it is most respectfully prayed that this Hon’ble Tribunal may be pleased to:", numbering),
    ...htmlListItems(prayerRef, reliefs, numbering),
    ...oaPara(mainRef, "Interim Relief", project.oa.interimNil ? "NIL" : "In view of the foregoing submissions, it is most respectfully prayed that, pending final adjudication of this Original Application, this Hon’ble Tribunal may be pleased to:", numbering),
    ...(project.oa.interimNil ? [] : htmlListItems(interimRef, interimStrings, numbering)),
  ];
}

// Last page (Para 10 → Verification). `applicantIdx` marks it for a specific
// applicant (multi-applicant signing); null = the sole/default deponent.
// `pageBreak` defaults to the Settings choice; standalone components pass false
// because they already begin their own document.
function buildLastPage(project: DraftoProject, applicantIdx: number | null, numbering: any[], opts?: { pageBreak?: boolean }): Child[] {
  const wantBreak = opts?.pageBreak ?? getOaForceLastPageBreak();
  const d = deponentFor(project, applicantIdx ?? undefined);
  const year = new Date().getFullYear();
  // Its own numbering reference starting at 10, so every applicant's last page
  // restarts the count at 10 rather than continuing past 12.
  const lastRef = newRef();
  numbering.push(decimalDef(lastRef, 10));
  return [
    ...(wantBreak ? [new Paragraph({ children: [new PageBreak()] })] : []),
    ...oaPara(lastRef, "Application through Registered Post", "N.A.", numbering),
    ...oaPara(lastRef, "Particulars of postal orders in respect of the Application Fee", esc(project.oa.postalOrders?.trim() || ""), numbering),
    ...oaPara(lastRef, "List of Enclosures", "As mentioned in the Index.", numbering),
    deponentLine(applicantIdx ?? undefined),
    ...oaFiledBy(project),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 240 }, children: [smartTextRun({ text: "VERIFICATION", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [smartTextRun(`I, ${d.name}, ${d.rel} ${d.father}, aged ${d.age} years, resident of ${d.address}, hereby verify at ${d.place} on this ____ day of ________, ${year} that the contents of the above OA are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.`)] }),
    deponentLine(applicantIdx ?? undefined),
  ];
}

// ── MA / PT ──────────────────────────────────────────────────────────────────
function delayText(project: DraftoProject): string { return project.oa.delayDays?.trim() || "__"; }

export function maProvision(project: DraftoProject, ma: OaMa): string {
  // A user-typed provision always wins, whatever the kind.
  if (ma.provision?.trim()) return ma.provision.trim();
  switch (ma.kind) {
    case "delay": return "Section 21(3) of the Administrative Tribunals Act, 1985 read with Rule 8(4) of the CAT (Procedure) Rules, 1987";
    case "joinder": return "Rule 4(5)(a) of the CAT (Procedure) Rules, 1987";
    case "exemptCopies": return "Rule 24 of the CAT (Procedure) Rules, 1987";
    case "exemptTranslation": return "Rule 3(1) proviso read with Rule 24 of the CAT (Procedure) Rules, 1987";
    case "pt": return "Section 25 of the Administrative Tribunals Act, 1985 read with Rule 6 of the CAT (Procedure) Rules, 1987";
    default: return "[provision]";
  }
}
export function maFirstPrayer(project: DraftoProject, ma: OaMa): string {
  // A user-typed first prayer always wins, whatever the kind.
  if (ma.firstPrayer?.trim()) return ma.firstPrayer.trim();
  const p = plurals(project);
  const bench = oaBench(getSettings().oaBench).name;
  switch (ma.kind) {
    case "delay": return ma.delayWithoutPrejudice ? "Condone the delay, if any, in filing the accompanying OA; and" : `Condone the delay of ${delayText(project)} days in filing the accompanying OA; and`;
    case "joinder": return "Allow the Applicants to join together and file a single Original Application; and";
    case "exemptCopies": return `Exempt the ${p.Appl} from filing certified/clear/legible copies of Annexures ${ma.annexureList?.trim() || "[list]"}; and`;
    case "exemptTranslation": return `Exempt the ${p.Appl} from filing English translations of Annexures ${ma.annexureList?.trim() || "[list]"}; and`;
    case "pt": return `Grant leave to the ${p.Appl} to file the accompanying Original Application before the Registrar, ${bench}; and`;
    default: return "[first prayer]";
  }
}
// The MA prayer substance for the heading and Para 2 ("may be pleased to …").
function maPraySubstance(project: DraftoProject, ma: OaMa): string {
  const fp = maFirstPrayer(project, ma).replace(/;\s*and\s*$/i, "").trim();
  return fp.charAt(0).toLowerCase() + fp.slice(1);
}

function buildMaChildren(project: DraftoProject, ma: OaMa, numbering: any[], opts?: { includeAffidavit?: boolean }): Child[] {
  const p = plurals(project);
  const isPt = ma.kind === "pt";
  const shortLabel = isPt ? "Petition for Transfer" : "MA";
  const provision = maProvision(project, ma);
  const prayerRef = newRef(); numbering.push(listDef(prayerRef, ma.numbering as OaStyle));

  const customBody = (ma.body || []).map((b) => b.particulars).filter(htmlHasText);
  const prayers = [maFirstPrayer(project, ma), RESIDUARY];

  // Every MA paragraph is one item of a single auto-numbered decimal list, built
  // as HTML so inline formatting (bold / italics / highlight) survives.
  const bodyRef = newRef(); numbering.push(decimalDef(bodyRef));
  const maPara = (innerHtml: string): Paragraph[] => {
    const parsed = parseHtml(`<p>${innerHtml}</p>`, { before: 120 }, { reference: bodyRef, level: 0 }, OA_LIST_GEOM);
    if (parsed.numbering.length) numbering.push(...parsed.numbering);
    return parsed.paragraphs;
  };

  return [
    ...createOaHeader(maHeaderPrefix(ma.kind)),
    ...createOaPartiesHeader(project),
    docTitle(`${isPt ? "PETITION FOR TRANSFER" : "MISCELLANEOUS APPLICATION"} UNDER ${provision.toUpperCase()} PRAYING THAT THIS HON’BLE TRIBUNAL MAY BE PLEASED TO ${maPraySubstance(project, ma).toUpperCase()}.`),
    new Paragraph({ spacing: { before: 120 }, children: [smartTextRun({ text: "The Applicant most respectfully submits that:", bold: true })] }),
    ...maPara(`The accompanying OA has been filed praying that this Hon’ble Tribunal may be pleased to ${oaPrayersInline(project)} The contents of the OA are not being repeated herein for the sake of brevity and may kindly be read as part and parcel of this ${shortLabel}.`),
    ...maPara(`By this ${shortLabel}, the ${p.Appl} ${p.prays} that this Hon’ble Tribunal may be pleased to ${esc(maPraySubstance(project, ma))}.`),
    ...(ma.kind === "joinder" ? maPara("The Applicants submit that they have a common interest in the matter having regard to the cause of action and nature of relief prayed for.") : []),
    ...customBody.flatMap((t) => maPara(inlineHtml(t))),
    ...maPara(`This ${shortLabel} is filed in good faith and in the interests of justice.`),
    ...maPara(`<b>PRAYERS:</b> In view of the foregoing submissions, it is most respectfully prayed that this Hon’ble Tribunal may be pleased to:`),
    ...prayers.map((t) => listItem(prayerRef, t)),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 160 }, children: [smartTextRun({ text: `And for which act of kindness, the humble ${p.Appl} shall ever pray.`, italics: true })] }),
    ...oaFiledBy(project),
    // Affidavit (omitted on the PDF path, which appends the generated or
    // uploaded signed affidavit as its own component).
    ...((opts?.includeAffidavit ?? true)
      ? [new Paragraph({ children: [new PageBreak()] }), ...buildMaAffidavit(project, ma, numbering)]
      : []),
  ];
}

function buildMaAffidavit(project: DraftoProject, ma: OaMa, numbering: any[]): Child[] {
  const d = deponentFor(project);
  const affRef = newRef(); numbering.push(decimalDef(affRef));
  const year = new Date().getFullYear();
  const preamble = `I, ${d.name}, ${d.rel} ${d.father}, aged about ${d.age} years, R/o ${d.address}, do hereby solemnly affirm and declare as under:`;
  const paras = [
    `I am the ${oaDeponentRole(project)} in the accompanying Original Application and am duly authorised to swear this Affidavit. I am fully conversant with the facts of the case and competent to swear to this Affidavit.`,
    `The accompanying ${ma.kind === "pt" ? "Petition for Transfer" : "Miscellaneous Application"} has been drafted under my instructions and the same has been read over to me and understood by me. I say that the averments made therein are true to the best of my knowledge and belief. Nothing material has been concealed therefrom and no part of it is false.`,
    "The accompanying annexures, if any, are true copies of their respective originals.",
  ];
  return [
    ...createOaHeader(maHeaderPrefix(ma.kind)),
    ...createOaPartiesHeader(project),
    centered("AFFIDAVIT", { bold: true }),
    new Paragraph({ children: [smartTextRun(preamble)] }),
    ...paras.map((t) => listItem(affRef, t)),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [smartTextRun({ text: "DEPONENT", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 240 }, children: [smartTextRun({ text: "VERIFICATION", bold: true })] }),
    new Paragraph({ children: [smartTextRun(`I, ${d.name}, the deponent above named, hereby verify at ${d.place} on this ____ day of __________, ${year} that the contents of the above Affidavit are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.`)] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 360 }, children: [smartTextRun({ text: "DEPONENT", bold: true })] }),
  ];
}

// ── Memo of Parties ──────────────────────────────────────────────────────────
const cellMargins = { top: 0, bottom: 0, left: 115, right: 115 };
const tableSpacing = { before: 120, after: 120 };
function centeredBoldCell(text: string): Paragraph { return new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun({ text, bold: true })], spacing: tableSpacing }); }
function buildOaMemo(project: DraftoProject): Child[] {
  const rows = (parties: typeof project.petitioners, role: string) => parties.map((pt, i) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, spacing: tableSpacing })], verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: pt.name || "[Name]", bold: true })], spacing: tableSpacing }), ...(pt.through?.trim() ? [new Paragraph({ children: [smartTextRun({ text: pt.through.trim(), italics: true })], spacing: tableSpacing })] : []), ...(pt.address ? [new Paragraph({ text: pt.address, spacing: tableSpacing })] : [])], verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun(parties.length <= 1 ? `…${role}` : `…${role} No. ${i + 1}`)], spacing: tableSpacing })], verticalAlign: VerticalAlign.BOTTOM, margins: cellMargins }),
  ] }));
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [1000, 6500, 2500], borders: NO_BORDERS, rows: [
    new TableRow({ children: [new TableCell({ children: [centeredBoldCell("S. No.")], margins: cellMargins }), new TableCell({ children: [centeredBoldCell("Particulars")], margins: cellMargins }), new TableCell({ children: [centeredBoldCell("Position")], margins: cellMargins })] }),
    ...rows(project.petitioners, "Applicant"),
    new TableRow({ children: [new TableCell({ columnSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [smartTextRun("Versus")], spacing: tableSpacing })], margins: cellMargins })] }),
    ...rows(project.respondents, "Respondent"),
  ] });
  return [...createOaHeader(), ...createOaPartiesHeader(project), centered("MEMO OF PARTIES", { bold: true }), table, ...oaFiledBy(project)];
}

// ── Synopsis & List of Dates ─────────────────────────────────────────────────
function buildOaSynopsisAndLod(project: DraftoProject, numbering: any[]): Child[] {
  const synopsis = parseHtml(project.synopsis || ""); numbering.push(...synopsis.numbering);
  const lodRows = (project.listOfDates || []).map((lod) => { const ev = parseHtml(lod.event || "", tableSpacing); numbering.push(...ev.numbering); return new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ text: lod.date || "", alignment: AlignmentType.CENTER, spacing: tableSpacing })], width: { size: 20, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
    new TableCell({ children: ev.paragraphs.length ? ev.paragraphs : [new Paragraph("")], width: { size: 80, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.TOP, margins: cellMargins }),
  ] }); });
  const lodTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [2000, 8000], rows: [
    new TableRow({ children: [new TableCell({ children: [centeredBoldCell("Date")], width: { size: 20, type: WidthType.PERCENTAGE }, margins: cellMargins }), new TableCell({ children: [centeredBoldCell("Event")], width: { size: 80, type: WidthType.PERCENTAGE }, margins: cellMargins })] }),
    ...lodRows,
  ] });
  // No OA header on this component — it opens with the SYNOPSIS title itself.
  return [centered("SYNOPSIS", { bold: true }), ...(synopsis.paragraphs.length ? synopsis.paragraphs : [new Paragraph("")]), new Paragraph({ children: [new PageBreak()] }), centered("LIST OF DATES", { bold: true }), lodTable];
}

// ── Vakalatnama ──────────────────────────────────────────────────────────────
function buildOaVakalatnama(project: DraftoProject, numbering: any[]): Child[] {
  const p = plurals(project);
  // Fall back to the CAT defaults in Settings when the case hasn't overridden
  // them, so the vakalatnama is never left with a blank advocate.
  const adv = oaAdvocate(project);
  const advName = [adv.name, adv.firm].filter(Boolean).join(", ") || "[Advocate]";
  // Full details are listed under the ADVOCATE signature block.
  const advDetails = [
    adv.name && { text: adv.name, bold: true },
    adv.enrolmentNo && { text: `Enrl. No.: ${adv.enrolmentNo}` },
    adv.firm && { text: adv.firm },
    adv.address && { text: adv.address },
    adv.email && { text: adv.email },
    adv.phone && { text: adv.phone },
  ].filter(Boolean) as { text: string; bold?: boolean }[];
  const executants = p.names.join("; ") || getPartyHeader(project.petitioners);
  const we = p.multi ? "We" : "I", my = p.multi ? "our" : "my";
  const authRef = newRef(); numbering.push(listDef(authRef, "lower-alpha"));
  const authority = [
    "To act, appear and plead in the above-noted case before this Hon’ble Tribunal or in any other Court or Tribunal in which the same may be tried or heard and also in appeal or revision.",
    "To sign, file, verify and present pleadings, applications, replies, objections, affidavits or other documents as may be deemed necessary or proper for the prosecution of the said case in all its stages.",
    "To withdraw or compromise the said case or submit to arbitration any differences or disputes arising in the said case.",
    "To deposit, draw and receive moneys and grant receipts therefor and to do all other acts and things necessary for the prosecution of the said case.",
    "To appoint and instruct any other legal Practitioner to exercise the powers and authority hereby conferred whenever the Advocate may think fit.",
  ];
  return [
    ...createOaHeader(), ...createOaPartiesHeader(project), centered("VAKALATNAMA", { bold: true }),
    new Paragraph({ children: [smartTextRun(`${we}, ${executants}, the ${p.Appl} in the captioned matter, do hereby appoint ${advName} to be ${my} Advocate in the above-noted case and authorise ${p.multi ? "them" : "him"}:`)] }),
    ...authority.map((t) => listItem(authRef, t)),
    new Paragraph({ spacing: { before: 240 }, children: [smartTextRun("Dated: ____________")] }),
    new Paragraph({ children: [smartTextRun("Signed, Accepted and Identified by:")] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [5000, 5000], borders: NO_BORDERS, rows: [new TableRow({ children: [
      new TableCell({ children: [
        new Paragraph({ children: [smartTextRun({ text: "ADVOCATE", bold: true })] }),
        ...advDetails.map((d) => new Paragraph({ children: [smartTextRun(d.bold ? { text: d.text, bold: true } : d.text)] })),
      ], borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP }),
      new TableCell({ children: p.multi ? p.names.map((n, i) => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: i === 0 ? 0 : 480 }, children: [smartTextRun({ text: `APPLICANT NO. ${i + 1} — ${n}`, bold: true })] })) : [new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "APPLICANT", bold: true })] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP }),
    ] })] }),
  ];
}

// ── Authority Letter (per non-authorised applicant) ──────────────────────────
function buildAuthorityLetter(project: DraftoProject, applicantIdx: number): Child[] {
  const authIdx = Math.max(0, (project.oa.authorizedApplicant || 1) - 1);
  const me = project.petitioners?.[applicantIdx];
  const auth = project.petitioners?.[authIdx];
  const d = project.deponent || ({} as any);
  return [
    ...createOaHeader(), ...createOaPartiesHeader(project), centered("AUTHORITY LETTER", { bold: true }),
    new Paragraph({ children: [smartTextRun(`I, ${me?.name?.trim() || `[Applicant No. ${applicantIdx + 1}]`}, ${d.relationship || "son of"} ${d.fatherName || "____"}, aged ${d.age || "__"} years, resident of ${me?.address || d.address || "____"}, Applicant No. ${applicantIdx + 1} in the present OA, hereby authorize ${auth?.name?.trim() || `[Applicant No. ${authIdx + 1}]`}, Applicant No. ${authIdx + 1} in this OA, to sign and execute all pleadings, applications and affidavits on my behalf in connection with this OA.`)] }),
    new Paragraph({ spacing: { before: 360 }, children: [] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [5000, 5000], borders: NO_BORDERS, rows: [new TableRow({ children: [
      new TableCell({ children: [new Paragraph({ children: [smartTextRun("Date: ____________")] }), new Paragraph({ children: [smartTextRun("Place: ____________")] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP }),
      new TableCell({ children: [new Paragraph({ children: [smartTextRun(`Name: ${me?.name?.trim() || ""}`)] }), new Paragraph({ children: [smartTextRun(`Applicant No. ${applicantIdx + 1}`)] }), new Paragraph({ spacing: { before: 240 }, children: [smartTextRun("Signature: ____________")] })], borders: NO_BORDERS, verticalAlign: VerticalAlign.TOP }),
    ] })] }),
  ];
}

// ── Index ────────────────────────────────────────────────────────────────────
function buildOaIndex(project: DraftoProject, pageRanges?: Record<string, string>): Child[] {
  const items: { key: string; text: string }[] = [
    { key: "memo", text: "Memo of Parties" },
    { key: "synopsis", text: "Synopsis and List of Dates" },
  ];
  const pts = project.oa.mas.filter((m) => m.kind === "pt");
  const mas = project.oa.mas.filter((m) => m.kind !== "pt");
  pts.forEach((pt, i) => items.push({ key: `pt:${i}`, text: `Petition for Transfer under ${maProvision(project, pt)}, with Affidavit` }));
  mas.forEach((ma, i) => items.push({ key: `ma:${i}`, text: `Miscellaneous Application under ${maProvision(project, ma)}, with Affidavit` }));
  items.push({ key: "oa", text: "Original Application under Section 19 of the Administrative Tribunals Act, 1985" });
  // The Last Page(s) are part of the Original Application, not a separate Index
  // entry — their pages simply extend the OA's page range.
  const applicantsN = (project.petitioners || []).filter((p) => p.name?.trim()).length;
  // Each annexure listed individually, in A-order, from the List of Dates.
  for (const e of wpAnnexureOrder(project)) {
    const label = oaAnnexLabel(e.pNumber, e.annex);
    const copy = e.annex.isColly ? "True copies of" : `A ${e.annex.copyType || "true copy"} of`;
    const dated = e.annex.date ? ` dated ${e.annex.date}` : "";
    items.push({ key: `annex:${e.annex.id}`, text: `${label}: ${copy} ${e.annex.title || "[description]"}${dated}` });
  }
  items.push({ key: "vakalatnama", text: "Vakalatnama" });
  if (project.oa.signingMode === "authority" && applicantsN > 1) {
    const authIdx = (project.oa.authorizedApplicant || 1) - 1;
    for (let i = 0; i < applicantsN; i++) if (i !== authIdx) items.push({ key: `auth:${i}`, text: `Authority Letter — Applicant No. ${i + 1}` });
  }
  items.push({ key: "courtFee", text: "Court Fee" });
  items.push({ key: "proofOfService", text: "Proof of Service" });
  const rows = items.map((t, i) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, spacing: tableSpacing })], margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ children: [smartTextRun(t.text)], spacing: tableSpacing })], margins: cellMargins }),
    new TableCell({ children: [new Paragraph({ text: pageRanges?.[t.key] ?? "", alignment: AlignmentType.CENTER, spacing: tableSpacing })], margins: cellMargins }),
  ] }));
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [800, 7700, 1500], rows: [
    new TableRow({ children: [new TableCell({ children: [centeredBoldCell("S. No.")], margins: cellMargins }), new TableCell({ children: [centeredBoldCell("Particulars")], margins: cellMargins }), new TableCell({ children: [centeredBoldCell("Pages")], margins: cellMargins })] }),
    ...rows,
  ] });
  return [...createOaHeader(), ...createOaPartiesHeader(project), centered("INDEX", { bold: true }), table, ...oaFiledBy(project)];
}

// ── public generators ────────────────────────────────────────────────────────
export async function generateOaBody(project: DraftoProject) {
  const numbering: any[] = [];
  const mainRef = newRef();
  numbering.push(decimalDef(mainRef));
  const children = [...buildOaBody(project, numbering, mainRef), ...buildLastPage(project, null, numbering)];
  return pack(oaDoc(children, numbering), "OA.docx");
}

// Everything the OA needs, as one document (each component on a fresh page):
// Index → Memo → Synopsis+LoD → PT(s)+affidavit → MA(s)+affidavit → OA (Paras
// 1–9) → per-applicant Last Page(s) → Vakalatnama → Authority Letter(s).
export async function generateOaAll(project: DraftoProject) {
  const numbering: any[] = [];
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
  const children: Child[] = [];
  const add = (block: Child[]) => { if (children.length) children.push(pageBreak()); children.push(...block); };

  add(buildOaIndex(project));
  add(buildOaMemo(project));
  add(buildOaSynopsisAndLod(project, numbering));
  for (const ma of project.oa.mas.filter((m) => m.kind === "pt")) add(buildMaChildren(project, ma, numbering));
  for (const ma of project.oa.mas.filter((m) => m.kind !== "pt")) add(buildMaChildren(project, ma, numbering));
  const mainRef = newRef();
  numbering.push(decimalDef(mainRef));
  add(buildOaBody(project, numbering, mainRef)); // Paras 1–9 (Last Pages follow)

  const p = plurals(project);
  // The first last page honours the Settings choice; any further per-applicant
  // copies always start fresh, since each is a separate sheet to be signed.
  if (p.multi) {
    for (let i = 0; i < p.count; i++) {
      children.push(...buildLastPage(project, i, numbering, i === 0 ? undefined : { pageBreak: true }));
    }
  } else {
    children.push(...buildLastPage(project, null, numbering));
  }

  add(buildOaVakalatnama(project, numbering));
  if (project.oa.signingMode === "authority") {
    const authIdx = (project.oa.authorizedApplicant || 1) - 1;
    for (let i = 0; i < p.count; i++) if (i !== authIdx) add(buildAuthorityLetter(project, i));
  }
  return pack(oaDoc(children, numbering), "OA-Complete.docx");
}

// ── per-component generators (used by the PDF paper-book assembler) ──────────
export function oaAnnexLabel(pNumber: number, annex: { isColly?: boolean }): string {
  return `Annexure A-${pNumber}${annex.isColly ? " (Colly)" : ""}`;
}

export async function generateOaIndexDoc(project: DraftoProject, pageRanges?: Record<string, string>) {
  return pack(oaDoc(buildOaIndex(project, pageRanges)), "OA-Index.docx");
}
export async function generateOaMemoDoc(project: DraftoProject) {
  return pack(oaDoc(buildOaMemo(project)), "OA-MemoOfParties.docx");
}
export async function generateOaSynopsisDoc(project: DraftoProject) {
  const numbering: any[] = [];
  const children = buildOaSynopsisAndLod(project, numbering);
  return pack(oaDoc(children, numbering), "OA-SynopsisAndLoD.docx");
}
/** Paras 1–9 only (the Last Page is a separate component in the paper-book). */
export async function generateOaBodyOnly(project: DraftoProject) {
  const numbering: any[] = [];
  const mainRef = newRef(); numbering.push(decimalDef(mainRef));
  return pack(oaDoc(buildOaBody(project, numbering, mainRef), numbering), "OA-Body.docx");
}
export async function generateOaLastPageDoc(project: DraftoProject, applicantIdx: number | null) {
  const numbering: any[] = [];
  // Drop the leading page break — as a standalone component it starts the page.
  const children = buildLastPage(project, applicantIdx, numbering, { pageBreak: false });
  return pack(oaDoc(children, numbering), "OA-LastPage.docx");
}
export async function generateOaMaDoc(project: DraftoProject, ma: OaMa, opts?: { includeAffidavit?: boolean }) {
  const numbering: any[] = [];
  return pack(oaDoc(buildMaChildren(project, ma, numbering, opts), numbering), "OA-MA.docx");
}
export async function generateOaMaAffidavitDoc(project: DraftoProject, ma: OaMa) {
  const numbering: any[] = [];
  return pack(oaDoc(buildMaAffidavit(project, ma, numbering), numbering), "OA-MA-Affidavit.docx");
}
export async function generateOaVakalatnamaDoc(project: DraftoProject) {
  const numbering: any[] = [];
  return pack(oaDoc(buildOaVakalatnama(project, numbering), numbering, { vak: true }), "OA-Vakalatnama.docx");
}
export async function generateOaAuthorityLetterDoc(project: DraftoProject, applicantIdx: number) {
  return pack(oaDoc(buildAuthorityLetter(project, applicantIdx)), "OA-AuthorityLetter.docx");
}

/** All Miscellaneous Applications and the Petition for Transfer, each with its
 *  affidavit, in filing order (PT first). */
export async function generateOaApplicationsDoc(project: DraftoProject) {
  const numbering: any[] = [];
  const children: Child[] = [];
  const ordered = [
    ...(project.oa.mas || []).filter((m) => m.kind === "pt"),
    ...(project.oa.mas || []).filter((m) => m.kind !== "pt"),
  ];
  for (const ma of ordered) {
    if (children.length) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...buildMaChildren(project, ma, numbering));
  }
  if (!children.length) children.push(new Paragraph({ children: [smartTextRun("No applications — none are triggered and none have been added.")] }));
  return pack(oaDoc(children, numbering), "OA-Applications.docx");
}

/** Signing Pages: the Last Page(s), the Vakalatnama and every application's
 *  Affidavit — i.e. everything the Applicant(s) physically sign. */
export async function generateOaSigningPagesDoc(project: DraftoProject) {
  const numbering: any[] = [];
  const children: Child[] = [];
  const brk = () => { if (children.length) children.push(new Paragraph({ children: [new PageBreak()] })); };

  const applicants = (project.petitioners || []).filter((p) => p.name?.trim());
  if (applicants.length > 1) {
    for (let i = 0; i < applicants.length; i++) {
      brk();
      children.push(...buildLastPage(project, i, numbering, { pageBreak: false }));
    }
  } else {
    brk();
    children.push(...buildLastPage(project, null, numbering, { pageBreak: false }));
  }

  brk();
  children.push(...buildOaVakalatnama(project, numbering));

  const ordered = [
    ...(project.oa.mas || []).filter((m) => m.kind === "pt"),
    ...(project.oa.mas || []).filter((m) => m.kind !== "pt"),
  ];
  for (const ma of ordered) {
    brk();
    children.push(...buildMaAffidavit(project, ma, numbering));
  }

  // Authority letters are signed too, when that signing mode is in use.
  if (project.oa.signingMode === "authority" && applicants.length > 1) {
    const authIdx = (project.oa.authorizedApplicant || 1) - 1;
    for (let i = 0; i < applicants.length; i++) {
      if (i === authIdx) continue;
      brk();
      children.push(...buildAuthorityLetter(project, i));
    }
  }
  return pack(oaDoc(children, numbering), "OA-SigningPages.docx");
}


import type { DraftoProject } from "@/lib/schema";
import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, TableLayoutType } from "docx";
import { createFiledByTable } from "./docx-helpers";
import { format } from "date-fns";
import { isScWpFamily } from "@/lib/court-family";
import { getOfficialCourtName } from "@/lib/court-names";

const tick = () => new TextRun({ text: "✓" });
const empty = () => new TextRun({ text: "□" });
const para = (text: string | TextRun) => new Paragraph({ children: [typeof text === 'string' ? new TextRun(text) : text], style: "Normal" });

const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

const lpCellMargins = {
    top: 35,
    bottom: 35,
    left: 80,
    right: 80,
};

const createCheckboxRow = (label: string, value: string, isChecked: boolean) => {
    return new TableRow({
        cantSplit: true,
        children: [
            new TableCell({
                children: [
                    new Paragraph({
                        children: [
                            isChecked ? tick() : empty(),
                            new TextRun({ text: ` ${label}` }),
                        ],
                        alignment: AlignmentType.LEFT,
                        style: "Normal",
                    }),
                ],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 38, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
                children: [new Paragraph({ children: [new TextRun(value)], style: "Normal" })],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 62, type: WidthType.PERCENTAGE },
            }),
        ],
    });
};

const createLabelValueRow = (label: string, value: string) => {
    return new TableRow({
        cantSplit: true,
        children: [
            new TableCell({
                children: [
                    new Paragraph({
                        children: [new TextRun(label)],
                        style: "Normal",
                        alignment: AlignmentType.LEFT,
                    }),
                ],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 38, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
                children: [new Paragraph({ children: [new TextRun(value)], style: "Normal" })],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 62, type: WidthType.PERCENTAGE },
            }),
        ],
    });
};

const createNumberedRow = (sNo: string, label: string, value: string | Paragraph) => {
    return new TableRow({
        cantSplit: true,
        children: [
            new TableCell({
                children: [para(sNo)],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 5, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
                children: [para(label)],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 35, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
                children: [typeof value === 'string' ? para(value) : value],
                borders: noBorders,
                margins: lpCellMargins,
                width: { size: 60, type: WidthType.PERCENTAGE },
            }),
        ],
    });
};

const formatActSectionPair = (act: string, section: string, isRule = false): string => {
    const cleanAct = act?.trim() || '';
    const cleanSec = section?.trim() || '';
    if (!cleanAct && !cleanSec) return '';
    if (!cleanSec) return cleanAct;
    if (!cleanAct) return cleanSec;

    const secPrefixRegex = isRule 
        ? /^(rule|r\.|r\/w)\s*/i 
        : /^(section|sec\.|sec|u\/s|article|art\.)\s*/i;
    const prefix = isRule ? "Rule " : "Section ";
    const formattedSec = secPrefixRegex.test(cleanSec) ? cleanSec : `${prefix}${cleanSec}`;
    return `${cleanAct}, ${formattedSec}`;
};

const formatSectionOnly = (act: string, section: string, isRule = false): string => {
    const cleanAct = act?.trim() || '';
    const cleanSec = section?.trim() || '';
    if (!cleanSec) return '';

    const secPrefixRegex = isRule 
        ? /^(rule|r\.|r\/w)\s*/i 
        : /^(section|sec\.|sec|u\/s|article|art\.)\s*/i;
    const prefix = isRule ? "Rule " : "Section ";
    const formattedSec = secPrefixRegex.test(cleanSec) ? cleanSec : `${prefix}${cleanSec}`;
    return cleanAct ? `${formattedSec} of ${cleanAct}` : formattedSec;
};

const getProvisionValues = (
    legalProvisions: Array<{ type?: string; act?: string; section?: string; id?: string }>,
    type: 'Central Act' | 'Central Rule' | 'State Act' | 'State Rule'
) => {
    const isRule = type.includes('Rule');
    const provisions = (legalProvisions || []).filter(p => p.type === type && (p.act?.trim() || p.section?.trim()));
    
    if (provisions.length === 0) {
        return { actValue: '', secValue: '', isChecked: false, isSecChecked: false };
    }
    if (provisions.length === 1) {
        const p = provisions[0];
        const act = p.act?.trim() || '';
        const sec = p.section?.trim() || '';
        return {
            actValue: act,
            secValue: sec,
            isChecked: !!act,
            isSecChecked: !!sec,
        };
    }
    // Multiple provisions: pair them up as "Act 1, Section 1; Act 2, Section 2"
    const actValue = provisions
        .map(p => formatActSectionPair(p.act, p.section, isRule))
        .filter(Boolean)
        .join('; ');

    const secValue = provisions
        .filter(p => p.section?.trim())
        .map(p => formatSectionOnly(p.act, p.section, isRule))
        .join('; ');

    return {
        actValue,
        secValue,
        isChecked: !!actValue,
        isSecChecked: !!secValue,
    };
};

export const createListingProforma = (data: DraftoProject, includeSignature = false) => {
    const { listingProforma, petitioners, respondents, caseType, advocate } = data;
    const proforma = listingProforma;

    const centralActInfo = getProvisionValues(proforma.legalProvisions || [], 'Central Act');
    const centralRuleInfo = getProvisionValues(proforma.legalProvisions || [], 'Central Rule');
    const stateActInfo = getProvisionValues(proforma.legalProvisions || [], 'State Act');
    const stateRuleInfo = getProvisionValues(proforma.legalProvisions || [], 'State Rule');

    const isInterim = data.impugnedOrders.some(o => o.type === "Interim Order");
    const isFinal = data.impugnedOrders.some(o => o.type.includes("Final"));
    const judgeNames = proforma.general.judgesPassedImpugned || '';
    
    const firstIo = data.impugnedOrders[0];
    const hcName = firstIo?.court ? getOfficialCourtName(firstIo.court, firstIo.customCourt) : '';

    const formatDate = (dateStr: string | Date) => { try { return format(new Date(dateStr), "dd.MM.yyyy"); } catch { return String(dateStr); } };
    const interimOrder = data.impugnedOrders.find(o => o.type === "Interim Order");
    const finalOrder = data.impugnedOrders.find(o => o.type.includes("Final"));
    const interimDate = interimOrder?.date ? formatDate(interimOrder.date) : '';
    const finalDate = finalOrder?.date ? formatDate(finalOrder.date) : '';

    const content: (Paragraph | Table)[] = [
        new Paragraph({
            children: [new TextRun({ text: "Annexure 'Y'" })],
            style: "Normal",
            alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
            children: [new TextRun({ text: "PROFORMA FOR FIRST LISTING", bold: true })],
            style: "Normal",
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 60 },
        }),
        new Paragraph({
            children: [new TextRun({ text: "Section ___" })],
            style: "Normal",
            alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
            text: "The case pertains to (Please tick/check the correct box):",
            style: "Normal",
            spacing: { before: 60, after: 40 },
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [3800, 6200],
            borders: noBorders,
            rows: [
                createCheckboxRow("Central Act:", centralActInfo.actValue, centralActInfo.isChecked),
                createCheckboxRow("Section:", centralActInfo.secValue, centralActInfo.isSecChecked),
                createCheckboxRow("Central Rule:", centralRuleInfo.actValue, centralRuleInfo.isChecked),
                createCheckboxRow("Rule No(s):", centralRuleInfo.secValue, centralRuleInfo.isSecChecked),
                createCheckboxRow("State Act:", stateActInfo.actValue, stateActInfo.isChecked),
                createCheckboxRow("Section:", stateActInfo.secValue, stateActInfo.isSecChecked),
                createCheckboxRow("State Rule:", stateRuleInfo.actValue, stateRuleInfo.isChecked),
                createCheckboxRow("Rule No(s):", stateRuleInfo.secValue, stateRuleInfo.isSecChecked),
                createCheckboxRow("Impugned Interim Order/Decree:", interimDate, isInterim),
                createCheckboxRow("Impugned Final Order/Decree:", finalDate, isFinal),
                createCheckboxRow("High Court:", hcName, !!hcName),
                createCheckboxRow("Names of Judges:", judgeNames, !!judgeNames),
                createCheckboxRow("Tribunal/Authority:", "", false),
            ],
        }),

        new Paragraph({
            text: "",
            style: "Normal",
            spacing: { before: 40, after: 40 },
        }),

        // Numbered List (Items 1 to 6)
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [500, 3500, 6000],
            borders: noBorders,
            rows: [
                createNumberedRow("1.", "Nature of matter:", new Paragraph({
                    children: [
                        caseType === 'Civil' ? tick() : empty(),
                        new TextRun(" Civil   "),
                        caseType === 'Criminal' ? tick() : empty(),
                        new TextRun(" Criminal"),
                    ],
                    style: "Normal",
                })),
                createNumberedRow("2.", "(a) Petitioner/appellant No.1:", petitioners[0]?.name || ''),
                createNumberedRow("", "(b) e-mail ID:", proforma.general.petitionerEmail || ''),
                createNumberedRow("", "(c) Mobile phone number:", proforma.general.petitionerPhone || ''),
                createNumberedRow("3.", "(a) Respondent No. 1:", respondents[0]?.name || ''),
                createNumberedRow("", "(b) e-mail ID:", proforma.general.respondentEmail || ''),
                createNumberedRow("", "(c) Mobile phone number:", proforma.general.respondentPhone || ''),
                createNumberedRow("4.", "(a) Main category classification:", proforma.general.mainCategory || ''),
                createNumberedRow("", "(b) Sub classification:", proforma.general.subCategory || ''),
                createNumberedRow("", "(c) Special Category:", proforma.general.specialCategory || ''),
                createNumberedRow("5.", "Not to be listed before:", proforma.general.notToListBefore || ''),
                createNumberedRow("6.", "(a) Similar disposed of matter with citation, if any, & case details:", proforma.general.similarDisposed || ''),
                createNumberedRow("", "(b) Similar pending matter with case details:", proforma.general.similarPending || ''),
            ],
        }),

        // 7. Criminal Matters
        new Paragraph({
            children: [new TextRun({ text: "7.\tCriminal Matters:", bold: true })],
            style: "Normal",
            spacing: { before: 120, after: 30 },
            keepNext: true,
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [3800, 6200],
            borders: noBorders,
            rows: [
                new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            children: [para("(a) Whether accused/convict has surrendered:")],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 38, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                            children: [
                                para(
                                    proforma.specialCategories.surrenderStatus === 'Has Surrendered'
                                        ? 'Yes'
                                        : proforma.specialCategories.surrenderStatus === 'Has Not Surrendered'
                                            ? 'No'
                                            : 'N.A.'
                                ),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 62, type: WidthType.PERCENTAGE },
                        }),
                    ],
                }),
                createLabelValueRow("(b) FIR No. and Date:", proforma.specialCategories.firNoAndDate || ''),
                createLabelValueRow("(c) Police Station:", proforma.specialCategories.policeStation || ''),
                createLabelValueRow("(d) Sentence Awarded:", proforma.specialCategories.sentenceAwarded || ''),
                createLabelValueRow("(e) Sentence Undergone:", proforma.specialCategories.sentenceUndergone || ''),
                new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            children: [para("(f) Whether any earlier case between the same parties is filed:")],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 38, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                            children: [para(proforma.specialCategories.earlierCaseSameParties || '')],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 62, type: WidthType.PERCENTAGE },
                        }),
                    ],
                }),
                createLabelValueRow("(g) Particulars of the FIR and Case:", proforma.specialCategories.firAndCaseParticulars || ''),
                createLabelValueRow("(h) Whether any bail application was preferred earlier and decision thereupon:", proforma.specialCategories.bailApplicationHistory || ''),
            ],
        }),

        // 8. Land Acquisition Matters
        new Paragraph({
            children: [new TextRun({ text: "8.\tLand Acquisition Matters:", bold: true })],
            style: "Normal",
            spacing: { before: 120, after: 30 },
            keepNext: true,
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [3800, 6200],
            borders: noBorders,
            rows: [
                createLabelValueRow("(a) Date of Section 4 notification:", proforma.specialCategories.landAcqS4 || ''),
                createLabelValueRow("(b) Date of Section 6 notification:", proforma.specialCategories.landAcqS6 || ''),
                createLabelValueRow("(c) Date of Section 17 notification:", proforma.specialCategories.landAcqS17 || ''),
            ],
        }),

        // 9. Tax Matters
        new Paragraph({
            children: [
                new TextRun({ text: "9.\tTax Matters: ", bold: true }),
                new TextRun("State the tax effect: "),
                new TextRun(proforma.specialCategories.taxEffect || ''),
            ],
            style: "Normal",
            spacing: { before: 100, after: 30 },
            keepNext: true,
        }),

        // 10. Special Category
        new Paragraph({
            children: [
                new TextRun({ text: "10.\tSpecial Category ", bold: true }),
                new TextRun("(first petitioner/appellant only):"),
            ],
            style: "Normal",
            spacing: { before: 100, after: 30 },
            keepNext: true,
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [5000, 5000],
            borders: noBorders,
            rows: [
                new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.senior ? tick() : empty(),
                                        new TextRun(" Senior citizen > 65 years"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.disabled ? tick() : empty(),
                                        new TextRun(" Disabled"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                    ],
                }),
                new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.scst ? tick() : empty(),
                                        new TextRun(" SC/ST"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.legalaid ? tick() : empty(),
                                        new TextRun(" Legal Aid case"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                    ],
                }),
                new TableRow({
                    cantSplit: true,
                    children: [
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.woman ? tick() : empty(),
                                        new TextRun(" Woman/child"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [
                                        proforma.specialCategories.petitionerCategories.custody ? tick() : empty(),
                                        new TextRun(" In custody"),
                                    ],
                                    style: "Normal",
                                }),
                            ],
                            borders: noBorders,
                            margins: lpCellMargins,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                        }),
                    ],
                }),
            ],
        }),

        // 11. Vehicle Number
        new Paragraph({
            children: [
                new TextRun({ text: "11.\tVehicle Number ", bold: true }),
                new TextRun("(in case of Motor Accident Claim matters): "),
                new TextRun(proforma.specialCategories.vehicleNo || ''),
            ],
            style: "Normal",
            spacing: { before: 100, after: 30 },
            keepNext: true,
        }),

        // 12. Decided Cases on Same Point
        new Paragraph({
            children: [
                new TextRun({ text: "12.\tWhether there was/is litigation on the same point of law, and if yes, details thereof: ", bold: true }),
                new TextRun(proforma.general.litigationOnSamePoint || ''),
            ],
            style: "Normal",
            spacing: { before: 100, after: 40 },
            keepNext: true,
        }),
    ];

    // Space before the AoR Table
    const isScWp = isScWpFamily(data.courtType);
    content.push(
        new Paragraph({
            text: "",
            style: "Normal",
            spacing: { before: 140, after: 100 },
        }),
        ...createFiledByTable(advocate.filingDate, advocate.aorName || "[AoR Name]", { includeSignature, isScWp })
    );
    
    content.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
            new TextRun(`AoR Code: ${advocate.aorCode || ''}`)
        ],
        spacing: { before: 40 },
        style: "Normal",
      })
    );

    return content;
};


import type { DraftoProject } from "@/lib/schema";
import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from "docx";
import { createFiledByTable } from "./docx-helpers";
import { format } from "date-fns";

const tick = () => new TextRun({ text: "✓" });
const empty = () => new TextRun({ text: "□" });
const para = (text: string | TextRun) => new Paragraph({ children: [typeof text === 'string' ? new TextRun(text) : text], style: "Normal" });
const boldLeftPara = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true })], style: "Normal", alignment: AlignmentType.LEFT });

const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

const createCheckboxRow = (label: string, value: string, isChecked: boolean) => {
    return new TableRow({
        children: [
            new TableCell({ children: [new Paragraph({ children: [isChecked ? tick() : empty(), new TextRun({ text: ` ${label}`, bold: true })], alignment: AlignmentType.LEFT })], borders: noBorders }),
            new TableCell({ children: [new Paragraph(value)], borders: noBorders }),
        ],
    });
};

const createLabelValueRow = (label: string, value: string) => {
    return new TableRow({
        children: [
            new TableCell({ children: [boldLeftPara(label)], borders: noBorders }),
            new TableCell({ children: [new Paragraph(value)], borders: noBorders }),
        ],
    });
}

export const createListingProforma = (data: DraftoProject) => {
    const { listingProforma, petitioners, respondents, caseType, advocate } = data;
    const proforma = listingProforma;

    const provisionData = proforma.legalProvisions.reduce((acc, provision) => {
        if (!acc[provision.type]) {
            acc[provision.type] = { acts: [], sections: [] };
        }
        acc[provision.type].acts.push(provision.act);
        acc[provision.type].sections.push(provision.section);
        return acc;
    }, {} as Record<string, { acts: string[], sections: string[] }>);

    const sections = {
        centralAct: provisionData['Central Act']?.acts.join(', ') || '',
        centralActSection: provisionData['Central Act']?.sections.join(', ') || '',
        centralRule: provisionData['Central Rule']?.acts.join(', ') || '',
        centralRuleNo: provisionData['Central Rule']?.sections.join(', ') || '',
        stateAct: provisionData['State Act']?.acts.join(', ') || '',
        stateActSection: provisionData['State Act']?.sections.join(', ') || '',
        stateRule: provisionData['State Rule']?.acts.join(', ') || '',
        stateRuleNo: provisionData['State Rule']?.sections.join(', ') || '',
    };
    
    const isInterim = data.impugnedOrders.some(o => o.type === "Interim Order");
    const isFinal = data.impugnedOrders.some(o => o.type.includes("Final"));
    const judgeNames = proforma.general.judgesPassedImpugned;
    const hcName = data.impugnedOrders[0]?.court === 'Other' ? data.impugnedOrders[0]?.customCourt : data.impugnedOrders[0]?.court;

    const formatDate = (dateStr: string | Date) => { try { return format(new Date(dateStr), "dd.MM.yyyy"); } catch { return String(dateStr); } };
    const interimOrder = data.impugnedOrders.find(o => o.type === "Interim Order");
    const finalOrder = data.impugnedOrders.find(o => o.type.includes("Final"));
    const interimDate = interimOrder?.date ? formatDate(interimOrder.date) : '';
    const finalDate = finalOrder?.date ? formatDate(finalOrder.date) : '';

    const content = [
        new Paragraph({
            children: [new TextRun({ text: "Annexure 'Y'" })],
            style: "Normal",
            alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({
            children: [new TextRun({ text: "PROFORMA FOR FIRST LISTING", bold: true })],
            style: "Normal",
            alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
            children: [new TextRun({ text: "Section ___" })],
            style: "Normal",
            alignment: AlignmentType.RIGHT,
        }),
        new Paragraph({ text: "", style: "Normal" }),
        new Paragraph({
            text: "The case pertains to (Please tick/check the correct box):",
            style: "Normal",
        }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [3500, 6500],
            borders: noBorders,
            rows: [
                createCheckboxRow("Central Act:", sections.centralAct, !!sections.centralAct),
                createCheckboxRow("Section:", sections.centralActSection, !!sections.centralActSection),
                createCheckboxRow("Central Rule:", sections.centralRule, !!sections.centralRule),
                createCheckboxRow("Rule No(s):", sections.centralRuleNo, !!sections.centralRuleNo),
                createCheckboxRow("State Act:", sections.stateAct, !!sections.stateAct),
                createCheckboxRow("Section:", sections.stateActSection, !!sections.stateActSection),
                createCheckboxRow("State Rule:", sections.stateRule, !!sections.stateRule),
                createCheckboxRow("Rule No(s):", sections.stateRuleNo, !!sections.stateRuleNo),
                createCheckboxRow("Impugned Interim Order/Decree:", interimDate, isInterim),
                createCheckboxRow("Impugned Final Order/Decree:", finalDate, isFinal),
                createCheckboxRow("High Court:", hcName || '', !!hcName),
                createCheckboxRow("Names of Judges:", judgeNames, !!judgeNames),
                createCheckboxRow("Tribunal/Authority:", "", false),
            ],
        }),
        new Paragraph({ text: "\n", style: "Normal" }),

        // Numbered List
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [500, 3200, 6300],
            borders: noBorders,
            rows: [
                new TableRow({ children: [ new TableCell({children: [para("1.")], borders: noBorders}), new TableCell({children: [boldLeftPara("Nature of matter:")], borders: noBorders}), new TableCell({children: [new Paragraph({ children: [caseType === 'Civil' ? tick() : empty(), new TextRun(" Civil  "), caseType === 'Criminal' ? tick() : empty(), new TextRun(" Criminal")] }) ], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("2.")], borders: noBorders}), new TableCell({children: [boldLeftPara("(a) Petitioner/appellant No.1:")], borders: noBorders}), new TableCell({children: [para(petitioners[0]?.name || '')], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(b) e-mail ID:")], borders: noBorders}), new TableCell({children: [para(proforma.general.petitionerEmail)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(c) Mobile phone number:")], borders: noBorders}), new TableCell({children: [para(proforma.general.petitionerPhone)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("3.")], borders: noBorders}), new TableCell({children: [boldLeftPara("(a) Respondent No. 1:")], borders: noBorders}), new TableCell({children: [para(respondents[0]?.name || '')], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(b) e-mail ID:")], borders: noBorders}), new TableCell({children: [para(proforma.general.respondentEmail)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(c) Mobile phone number:")], borders: noBorders}), new TableCell({children: [para(proforma.general.respondentPhone)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("4.")], borders: noBorders}), new TableCell({children: [boldLeftPara("(a) Main category classification:")], borders: noBorders}), new TableCell({children: [para(proforma.general.mainCategory)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(b) Sub classification:")], borders: noBorders}), new TableCell({children: [para(proforma.general.subCategory)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("5.")], borders: noBorders}), new TableCell({children: [boldLeftPara("Not to be listed before:")], borders: noBorders}), new TableCell({children: [para(proforma.general.notToListBefore)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("6.")], borders: noBorders}), new TableCell({children: [boldLeftPara("(a) Similar disposed of matter with citation, if any, & case details:")], borders: noBorders}), new TableCell({children: [para(proforma.general.similarDisposed)], borders: noBorders}) ]}),
                new TableRow({ children: [ new TableCell({children: [para("")], borders: noBorders}), new TableCell({children: [boldLeftPara("(b) Similar pending matter with case details:")], borders: noBorders}), new TableCell({children: [para(proforma.general.similarPending)], borders: noBorders}) ]}),
            ]
        }),
        new Paragraph({ text: "\n", style: "Normal" }),
        // Criminal Matters
        boldLeftPara("7.\tCriminal Matters:"),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [3500, 6500],
            borders: noBorders,
            rows: [
                new TableRow({ children: [new TableCell({children: [boldLeftPara("(a) Whether accused/convict has surrendered:")], borders: noBorders}), new TableCell({children: [proforma.specialCategories.surrenderStatus === 'N.A.' ? new Paragraph("N.A.") : new Paragraph({ children: [proforma.specialCategories.surrenderStatus === 'Has Surrendered' ? tick() : empty(), new TextRun(" Yes  "), proforma.specialCategories.surrenderStatus === 'Has Not Surrendered' ? tick() : empty(), new TextRun(" No")] })], borders: noBorders})]}),  
                createLabelValueRow("(b) FIR No. and Date:", `${proforma.specialCategories.firNo} ${proforma.specialCategories.firDate}`),
                createLabelValueRow("(c) Police Station:", proforma.specialCategories.policeStation),
                createLabelValueRow("(d) Sentence Awarded:", proforma.specialCategories.sentenceAwarded),
                createLabelValueRow("(e) Sentence Undergone:", proforma.specialCategories.sentenceUndergone),
                new TableRow({ children: [new TableCell({children: [boldLeftPara("(f) Whether any earlier case between the same parties is filed:")], borders: noBorders}), new TableCell({children: [new Paragraph({ children: [proforma.specialCategories.earlierCaseSameParties === 'Yes' ? tick() : empty(), new TextRun(" Yes  "), proforma.specialCategories.earlierCaseSameParties === 'No' ? tick() : empty(), new TextRun(" No")] })], borders: noBorders})]}),
                createLabelValueRow("(g) Particulars of the FIR and Case:", proforma.specialCategories.firAndCaseParticulars),
                createLabelValueRow("(h) Whether any bail application was preferred earlier and decision thereupon:", proforma.specialCategories.bailApplicationHistory),
            ]
        }),
        new Paragraph({ text: "\n", style: "Normal" }),
        boldLeftPara("8.\tLand Acquisition Matters:"),
        new Table({
             width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [3500, 6500],
            borders: noBorders,
            rows: [
                 createLabelValueRow("(a) Date of Section 4 notification:", proforma.specialCategories.landAcqS4),
                 createLabelValueRow("(b) Date of Section 6 notification:", proforma.specialCategories.landAcqS6),
                 createLabelValueRow("(c) Date of Section 17 notification:", proforma.specialCategories.landAcqS17),
            ]
        }),
        new Paragraph({ text: "\n", style: "Normal" }),
        new Paragraph({ children: [new TextRun({ text: "9.\tTax Matters: State the tax effect: ", bold: true }), new TextRun(proforma.specialCategories.taxEffect)], style: "Normal" }),
        new Paragraph({ text: "\n", style: "Normal" }),
        boldLeftPara("10.\tSpecial Category (first petitioner/appellant only):"),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [5000, 5000],
            borders: noBorders,
            rows: [
                new TableRow({ children: [new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.senior ? tick() : empty(), new TextRun(" Senior citizen > 65 years")]})], borders: noBorders}), new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.disabled ? tick() : empty(), new TextRun(" Disabled")]})], borders: noBorders}) ]}),
                new TableRow({ children: [new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.scst ? tick() : empty(), new TextRun(" SC/ST")]})], borders: noBorders}), new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.legalaid ? tick() : empty(), new TextRun(" Legal Aid case")]})], borders: noBorders}) ]}),
                new TableRow({ children: [new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.woman ? tick() : empty(), new TextRun(" Woman/child")]})], borders: noBorders}), new TableCell({children: [new Paragraph({ children: [ proforma.specialCategories.petitionerCategories.custody ? tick() : empty(), new TextRun(" In custody")]})], borders: noBorders}) ]}),
            ]
        }),
        new Paragraph({ text: "\n", style: "Normal" }),
        new Paragraph({ children: [new TextRun({ text: "11.\tVehicle Number (in case of Motor Accident Claim matters): ", bold: true }), new TextRun(proforma.specialCategories.vehicleNo)], style: "Normal" }),
        new Paragraph({ text: "\n", style: "Normal" }),
        new Paragraph({ children: [new TextRun({ text: "12.\tWhether there was/is litigation on the same point of law, and if yes, details thereof: ", bold: true }), new TextRun(proforma.general.litigationOnSamePoint)], style: "Normal" }),
        new Paragraph({ text: "\n", style: "Normal" }),
    ];

    content.push(...createFiledByTable(advocate.filingDate, advocate.aorName || "[AoR Name]"));
    
    content.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
            new TextRun(`AoR Code: ${advocate.aorCode || ''}`)
        ]
      })
    );

    return content;
};

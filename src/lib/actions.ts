
import { Packer } from "docx";
import { createSlpHeader, createPartiesHeader, createWithTable, getPartyHeader, createAnnexureText, createIaAnnexureText, createFiledByTable, createIaHeader, base64ToBuffer, convertToSmartQuotes, smartTextRun } from "@/lib/docx-helpers";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { Document, AlignmentType, Paragraph, TextRun, PageBreak, Table, TableCell, TableRow, WidthType, VerticalAlign, Header, Footer, PageNumber, SectionType, ISectionOptions, BorderStyle, CheckBox } from "docx";
import { differenceInDays, format } from "date-fns";
import { standardIaList } from "@/lib/ia-list";
import { createListingProforma } from "@/lib/proforma-helpers";
import { parseHtml } from "@/lib/html-to-docx";
import { checklistQueries } from "@/lib/checklist-queries";
import { PDFDocument, rgb, StandardFonts, PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFNumber, degrees } from 'pdf-lib';
import { convertDocxToPdf as ipcConvertDocxToPdf } from "@/lib/ipc/pdf";


const calculateIoText = (projectData: DraftoProject) => {
    if (!projectData.impugnedOrders || projectData.impugnedOrders.length === 0) {
      return '';
    }

    const sortedOrders = [...projectData.impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sortedOrders
      .map(order => {
        const courtName = order.court === 'Other' ? order.customCourt : order.court;
        const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
        return `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
      })
      .join(' and ');
}

const getIaList = (projectData: DraftoProject) => {
    const ias = [];
    const year = new Date().getFullYear();
    const iaPrefix = projectData.caseType === 'Civil' ? `IA ____/${year}` : `Crl. MP ___/${year}`;
    
    const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    
    // Additional Documents IA comes first for P-annexure continuity
    if (projectData.standardIas.additionalDocuments) {
        const title = standardIaList.find(i => i.id === 'additionalDocuments')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'additionalDocuments' });
    }
    if (projectData.standardIas.condonationOfDelay.active) {
        const delayDays = projectData.standardIas.condonationOfDelay.delayDays > 0 ? projectData.standardIas.condonationOfDelay.delayDays : "__";
        const title = `Application for condonation of delay of ${delayDays} days in filing the SLP`;
        ias.push({ prefix: iaPrefix, title, id: 'condonationOfDelay' });
    }
    if (projectData.standardIas.exemptionCertifiedCopy.active) {
        const title = standardIaList.find(i => i.id === 'exemptionCertifiedCopy')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionCertifiedCopy' });
    }
    if (projectData.standardIas.exemptionOfficialTranslation.active) {
        const annexureNumberingMap = new Map<string, number>();
        let pCounter = 1;
        allAnnexures.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        allAnnexures.filter(annex => annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        
        const translatedAnnexures = allAnnexures
          .filter(annex => annex.copyType === 'translated copy' || annex.copyType === 'true and translated copy')
          .map(annex => annexureNumberingMap.get(annex.id))
          .filter(Boolean)
          .map(pNumber => `P-${pNumber}`);
        
        let annexureList = '';
        if (translatedAnnexures.length > 0) {
            const last = translatedAnnexures.pop();
            annexureList = translatedAnnexures.length > 0
                ? `Annexures ${translatedAnnexures.join(', ')} and ${last}`
                : `Annexure ${last}`;
        }
        
        const title = `Application for exemption from filing Official Translation(s) of ${annexureList || projectData.standardIas.exemptionOfficialTranslation.reason || 'Annexures'}`;
        ias.push({ prefix: iaPrefix, title, id: 'exemptionOfficialTranslation' });
    }
    if (projectData.standardIas.exemptionFromSurrendering.active) {
        const title = standardIaList.find(i => i.id === 'exemptionFromSurrendering')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionFromSurrendering' });
    }
    projectData.customIas.forEach(ia => {
        ias.push({ prefix: iaPrefix, title: ia.title, id: ia.id });
    });
    return ias;
}

const defaultStyles = {
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: {
          font: "Times New Roman",
          size: 28, // 14pt
        },
        paragraph: {
          spacing: {
            line: 360, // 1.5 lines
            after: 240, // 12pt
            before: 0
          },
          alignment: AlignmentType.JUSTIFIED,
        },
      },
    ],
};

const defaultMargins = {
    top: 1.5 * 1440,
    right: 1 * 1440,
    bottom: 1 * 1440,
    left: 1.5 * 1440,
};

// Default cell margins matching MS Word (0.08 inches = 115 twips)
const defaultCellMargins = {
    top: 0,
    bottom: 0,
    left: 115,
    right: 115,
};

// Table paragraph spacing (6pt before and after)
const tableParagraphSpacing = {
    before: 120, // 6pt = 120 twips
    after: 120,  // 6pt = 120 twips
};

export async function generateCiDocx(projectData: DraftoProject, pageRanges?: Map<number, string>) {
  const ioText = ` ${calculateIoText(projectData)}`;
  const effectivePetitioners = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].petitioners
    : projectData.petitioners;
  const effectiveRespondents = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].respondents
    : projectData.respondents;
  const petHeader = getPartyHeader(effectivePetitioners);
  const resHeader = getPartyHeader(effectiveRespondents);
  
  if (projectData.impugnedOrders && projectData.impugnedOrders.length > 0 && projectData.advocate.filingDate) {
    const latestOrder = projectData.impugnedOrders.reduce((latest, current) => {
        return new Date(latest.date) > new Date(current.date) ? latest : current;
    });

    const daysDifference = differenceInDays(new Date(projectData.advocate.filingDate), new Date(latestOrder.date));
    const calculatedDelay = daysDifference - 90;
    projectData.standardIas.condonationOfDelay.delayDays = Math.max(0, calculatedDelay);
  }

  const iaList = getIaList(projectData);
  const aorName = projectData.advocate.aorName || "[AoR Name]";

  const year = new Date().getFullYear();
  const iaPrefix = projectData.caseType === 'Civil' ? `IA ____/${year}` : `Crl. MP ___/${year}`;

  const particularsList: (string | (TextRun | string)[])[] = [
      "Court Fees",
      "O/R on Limitation",
      "Listing Proforma",
      "Cover Page of Paper Book",
      "Index of Record of Proceedings",
      "Limitation Report prepared by the Registry",
      "Defect List",
      "Note Sheet",
      "Synopsis and List of Dates",
  ];

  if (projectData.impugnedOrders && projectData.impugnedOrders.length > 0) {
      const sortedOrders = [...projectData.impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      sortedOrders.forEach(order => {
          const courtName = order.court === 'Other' ? order.customCourt : order.court;
          const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
          const singleIoText = `the Impugned ${order.type || '[Order Type]'}`;
          particularsList.push(`Impugned ${order.type || '[Order Type]'}: True copy of ${singleIoText} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`);
      });
  } else {
      particularsList.push(`Impugned [Order Type]: True copy of [Impugned Order Details]`);
  }

  particularsList.push("Special Leave Petition with Certificate and Affidavit");

  if (projectData.wantsAppendix && (projectData.appendixFile || projectData.appendixManualEntry) && projectData.appendixDescription) {
    particularsList.push(`Appendix: Relevant provisions of the ${projectData.appendixDescription}`);
  }

  const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
  const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
  const adAnnexures = allAnnexures.filter(annex => annex.isAdditionalDocument);

  const annexureNumberingMap = new Map<string, number>();
  let pCounter = 1;
  nonAdAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
  adAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

  nonAdAnnexures.forEach(annex => {
    const pNumber = annexureNumberingMap.get(annex.id);
    if (pNumber) {
        particularsList.push(createAnnexureText(pNumber, annex, true));
    }
  });
  
  // Add Additional Documents IA with its AD P-annexures
  if (adAnnexures.length > 0) {
    const adIa = iaList.find(ia => ia.id === 'additionalDocuments');
    if (adIa) {
        particularsList.push([smartTextRun({ text: adIa.prefix, bold: true }), convertToSmartQuotes(`: ${adIa.title}`)]);
        adAnnexures.forEach(annex => {
            const pNumber = annexureNumberingMap.get(annex.id);
            if (pNumber) {
                particularsList.push(createAnnexureText(pNumber, annex, true));
            }
        });
    }
  }
  
  // Collect all IA ground annexures
  const allIaAnnexures: any[] = [];
  if (projectData.standardIas?.condonationOfDelay?.active) {
      projectData.standardIas.condonationOfDelay.grounds?.forEach(ground => {
          if (ground.annexures) {
              ground.annexures.forEach(annex => {
                  allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelay' });
              });
          }
      });
  }
  if (projectData.standardIas?.exemptionFromSurrendering?.active) {
      projectData.standardIas.exemptionFromSurrendering.grounds?.forEach(ground => {
          if (ground.annexures) {
              ground.annexures.forEach(annex => {
                  allIaAnnexures.push({ ...annex, iaId: 'exemptionFromSurrendering' });
              });
          }
      });
  }
  if (projectData.customIas && projectData.customIas.length > 0) {
      projectData.customIas.forEach(customIa => {
          if (customIa.grounds) {
              customIa.grounds.forEach(ground => {
                  if (ground.annexures) {
                      ground.annexures.forEach(annex => {
                          allIaAnnexures.push({ ...annex, iaId: customIa.id });
                      });
                  }
              });
          }
      });
  }

  const iaAnnexureNumberingMap = new Map<string, number>();
  let aCounter = 1;
  allIaAnnexures.forEach(a => iaAnnexureNumberingMap.set(a.id, aCounter++));

  // Add other IAs (excluding Additional Documents which was already added)
  const otherIas = iaList.filter(ia => ia.id !== 'additionalDocuments');
  otherIas.forEach(ia => {
    particularsList.push([smartTextRun({ text: ia.prefix, bold: true }), convertToSmartQuotes(`: ${ia.title}`)]);
    
    // Add IA ground annexures for this specific IA
    const iaSpecificAnnexures = allIaAnnexures.filter(a => a.iaId === ia.id);
    iaSpecificAnnexures.forEach(annex => {
        const aNum = iaAnnexureNumberingMap.get(annex.id);
        if (aNum) {
            particularsList.push(createIaAnnexureText(aNum, annex, true));
        }
    });

    // Add certified copy receipt entry (Annexure-A) for exemptionCertifiedCopy IA
    if (ia.id === 'exemptionCertifiedCopy' && projectData.standardIas?.exemptionCertifiedCopy?.hasApplied === 'yes') {
        const receiptDate = projectData.standardIas.exemptionCertifiedCopy.receiptDate;
        const dateText = receiptDate ? ` dated ${format(new Date(receiptDate), 'dd.MM.yyyy')}` : '';
        particularsList.push([
            smartTextRun({ text: 'Annexure-A', bold: true }),
            convertToSmartQuotes(`: True copy of the Receipt of application for certified copy${dateText}.`)
        ]);
    }
  });
  
  if (projectData.caseType === 'Criminal') {
    particularsList.push("Custody Certificate");
  }
  particularsList.push("Memo of Parties", "Filing Memo", "Vakalatnama(s)");


  const indexTableRows = [
      new TableRow({
          children: [
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "S.No.", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Particulars of the Document", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Page Nos. of Part to which it belongs", bold: true})], alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, columnSpan: 2, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Remarks", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, rowSpan: 2, margins: defaultCellMargins }),
          ],
      }),
      new TableRow({
          children: [
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Part 1 (Contents of the Paper Book)", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Part 2 (Contents of the file alone)", bold: true})], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
          ],
      }),
      ...particularsList.map((item, index) => {
          const sNo = index + 1;
          
          // Define standard page numbers for specific rows
          let part1PageNum = "";
          let part2PageNum = "";
          
          // Row 2: O/R on Limitation → Part 1: A
          if (sNo === 2) {
              part1PageNum = "A";
          }
          // Row 3: Listing Proforma → Part 1: A1-A2
          else if (sNo === 3) {
              part1PageNum = "A1-A2";
          }
          // Row 4: Cover Page of Paper Book → Part 2: A3
          else if (sNo === 4) {
              part2PageNum = "A3";
          }
          // Row 5: Index of Record of Proceedings → Part 2: A4
          else if (sNo === 5) {
              part2PageNum = "A4";
          }
          // Row 6: Limitation Report → Part 2: A5
          else if (sNo === 6) {
              part2PageNum = "A5";
          }
          // Row 7: Defect List → Part 2: A6
          else if (sNo === 7) {
              part2PageNum = "A6";
          }
          // Row 8: Note Sheet → Part 2: NS1-NS_
          else if (sNo === 8) {
              part2PageNum = "NS1-NS_";
          }
          // Row 9 onwards: Use calculated pageRanges in Part 1
          else if (sNo >= 9) {
              part1PageNum = pageRanges?.get(sNo) || "";
          }
          
          return new TableRow({
              children: [
                  new TableCell({ children: [new Paragraph({ text: `${sNo}.`, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ children: Array.isArray(item) ? item.map(i => (typeof i === 'string' ? smartTextRun(i) : i)) : [smartTextRun(item)], style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: part1PageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: part2PageNum, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                  new TableCell({ children: [new Paragraph({ text: "", style: "Normal", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
              ]
          });
      })
  ];
  
  const doc = new Document({
    styles: defaultStyles,
    sections: [
      { // Cover Page & Index
        properties: { page: { margin: defaultMargins } },
        headers: {
          default: new Header({ children: [] }),
        },
        footers: {
            default: new Footer({ children: [] }),
        },
        children: [
          ...createSlpHeader(projectData.caseType, ioText),
          ...createPartiesHeader(petHeader, resHeader),
          ...createWithTable(iaList),
          new Paragraph(""),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: "PAPERBOOK", bold: true }) ] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: "[For Index, please see inside]", italics: true }) ] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: `Advocate for the Petitioner(s): ${aorName}`, bold: true }) ] }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: "INDEX", bold: true }) ] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: indexTableRows }),
        ],
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: `CI.docx` };
}

export async function generateOrDocx(projectData: DraftoProject) {
  const ioText = ` ${calculateIoText(projectData)}`;
  const effectivePetitioners = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].petitioners
    : projectData.petitioners;
  const effectiveRespondents = (projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0)
    ? projectData.commonOrderParties[0].respondents
    : projectData.respondents;
  const petHeader = getPartyHeader(effectivePetitioners);
  const resHeader = getPartyHeader(effectiveRespondents);
  const aorName = projectData.advocate.aorName || "[AoR Name]";
  
  const doc = new Document({
    styles: defaultStyles,
    sections: [
      { // Office Report
        properties: { 
          page: { margin: defaultMargins }
        },
        headers: {
            default: new Header({
                children: [
                    new Paragraph({ alignment: AlignmentType.RIGHT, children: [smartTextRun({ text: "A", size: 40, bold: true })] }),
                ],
            }),
        },
        footers: {
          default: new Footer({ children: [] }),
        },
        children: [
          ...createSlpHeader(projectData.caseType, ioText),
          ...createPartiesHeader(petHeader, resHeader),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [ smartTextRun({ text: "OFFICE REPORT ON LIMITATION", bold: true }) ] }),
          new Paragraph({ children: [smartTextRun("1. The Special Leave Petition is within limitation.")] }),
          new Paragraph({ children: [smartTextRun("2. The Petition is barred by time and there is a delay of __ days in filing SLP against the judgment dated ____ and application for condonation of __ days' delay has been filed.")] }),
          new Paragraph({ children: [smartTextRun("3. There is delay of __ days in re-filing the petition and petition for condonation of __ days delay in re-filing has been/not been filed.")] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [ smartTextRun({ text: "BRANCH OFFICER", bold: true }) ] }),
          ...createFiledByTable(projectData.advocate.filingDate, aorName),
        ],
      },
    ],
  });

  const b64string = await Packer.toBase64String(doc);
  return { success: true, docx: b64string, fileName: `OR.docx` };
}

// Legacy function for backward compatibility - just returns CI.docx now
export async function generateCiorDocx(projectData: DraftoProject, pageRanges?: Map<number, string>) {
  return await generateCiDocx(projectData, pageRanges);
}

export async function generateLpDocx(projectData: DraftoProject) {
    const lpStyles = {
        paragraphStyles: [
          {
            id: "Normal",
            name: "Normal",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              font: "Times New Roman",
              size: 26, // 13pt
            },
            paragraph: {
              spacing: {
                line: 240, // single line
                after: 0, // 0pt
                before: 0,
              },
              alignment: AlignmentType.JUSTIFIED,
            },
          },
        ],
    };

    const doc = new Document({
        styles: lpStyles,
        sections: [{
            properties: { 
                page: { margin: defaultMargins },
                type: SectionType.NEXT_PAGE,
                pageNumberStart: 1,
            },
            headers: {
                default: new Header({ children: [] }),
            },
            footers: {
                default: new Footer({ children: [] }),
            },
            children: createListingProforma(projectData),
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `LP.docx` };
}

export async function generateSlodDocx(projectData: DraftoProject, annexurePageRanges?: Map<string, {start: number, end: number}>) {
    const allAnnexures: (Annexure & { lodId: string })[] = (projectData.listOfDates || []).flatMap(lod => (lod.annexures || []).map(a => ({ ...a, lodId: lod.id })));
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const annexureNumberingMap = new Map<string, number>();
    let pCounter = 1;
    nonAdAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

    let allNumberingConfigs: any[] = [];
    const lodEventParagraphs = projectData.listOfDates.map(lod => {
        const { paragraphs, numbering } = parseHtml(lod.event, tableParagraphSpacing);
        if (numbering.length > 0) {
            allNumberingConfigs.push(...numbering);
        }
        return { lodId: lod.id, paragraphs };
    });

    const synopsisResult = parseHtml(projectData.synopsis);
    if (synopsisResult.numbering.length > 0) {
        allNumberingConfigs.push(...synopsisResult.numbering);
    }
    
    const uniqueNumberingConfigs = allNumberingConfigs.filter(
      (v, i, a) => a.findIndex(t => t.reference === v.reference) === i
    );

    const createLodAnnexureText = (pNumber: number, annex: Annexure): (TextRun | string)[] => {
        const annexureLabel = `Annexure P-${pNumber}`;
        
        // Get page range if available
        const pageRange = annexurePageRanges?.get(annex.id);
        let pageRangeText: string;
        if (pageRange) {
            // Handle single page vs page range
            if (pageRange.start === pageRange.end) {
                pageRangeText = `(p.${pageRange.start})`;
            } else {
                pageRangeText = `(pp.${pageRange.start} to ${pageRange.end})`;
            }
        } else {
            pageRangeText = `(pp.___ to ___)`;
        }
        
        const parts: (TextRun | string)[] = [
            smartTextRun({ text: `${annexureLabel} ${pageRangeText}`, bold: true }),
            convertToSmartQuotes(` is a ${annex.copyType || '[copy type]'} of ${annex.title || '[description]'}`)
        ];

        if (annex.date) {
            parts.push(convertToSmartQuotes(` dated ${annex.date}`));
        }
        if (annex.customText) {
            parts.push(convertToSmartQuotes(` ${annex.customText}`));
        }
        
        // Auto-append period if user forgot (trim trailing whitespace first)
        const lastPart = parts[parts.length - 1];
        if (typeof lastPart === 'string') {
            const trimmed = lastPart.trimEnd();
            parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
        }
        
        return parts;
    };


    const lodTableRows = projectData.listOfDates.flatMap((lod, lodIndex) => {
        const annexureTexts: TextRun[] = [];
        const relatedAnnexures = nonAdAnnexures.filter(annex => annex.lodId === lod.id);
        
        relatedAnnexures.forEach((annex, index) => {
            const pNumber = annexureNumberingMap.get(annex.id);
            if (pNumber) {
                const annexureStringParts = createLodAnnexureText(pNumber, annex);
                
                if (index > 0) {
                    annexureTexts.push(new TextRun({ break: 1 }));
                }

                annexureStringParts.forEach(part => {
                    if (typeof part === 'string') {
                        annexureTexts.push(smartTextRun(part));
                    } else {
                        annexureTexts.push(part);
                    }
                });
            }
        });
        
        const eventParagraphs = lodEventParagraphs.find(p => p.lodId === lod.id)?.paragraphs || [new Paragraph("")];
        
        return new TableRow({
            children: [
                new TableCell({ 
                    children: [new Paragraph({ text: lod.date, style: "Normal", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
                    width: { size: 1417, type: WidthType.DXA }, // 2.5cm
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins
                }),
                new TableCell({ 
                    children: [
                        ...eventParagraphs,
                        ...(annexureTexts.length > 0 ? [new Paragraph({ children: annexureTexts, style: "Normal", spacing: tableParagraphSpacing })] : [])
                    ],
                    width: { size: 85, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins
                }),
            ]
        });
    });

    const lodTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({ 
                        children: [new Paragraph({ children: [smartTextRun({ text: "Date", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], 
                        width: { size: 1417, type: WidthType.DXA }, // 2.5cm
                        verticalAlign: VerticalAlign.CENTER,
                        margins: defaultCellMargins
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ children: [smartTextRun({ text: "Particulars", bold: true })], alignment: AlignmentType.CENTER, style: "Normal", spacing: tableParagraphSpacing })], 
                        width: { size: 85, type: WidthType.PERCENTAGE },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: defaultCellMargins
                    }),
                ]
            }),
            ...lodTableRows,
        ]
    });

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: defaultStyles,
        sections: [{
            properties: { page: { margin: defaultMargins } },
            children: [
                new Paragraph({ children: [smartTextRun({ text: "SYNOPSIS", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" }),
                ...synopsisResult.paragraphs,
                new Paragraph({ children: [new PageBreak()] }),
                new Paragraph({ children: [smartTextRun({ text: "LIST OF DATES", bold: true })], alignment: AlignmentType.CENTER, style: "Normal" }),
                lodTable,
            ],
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `SLoD.docx` };
}

export async function generateSlpDocx(projectData: DraftoProject) {
    const ioText = ` ${calculateIoText(projectData)}`;

    // For common order, use first group's parties for the header/AOR certificate
    const isCommonOrder = projectData.isCommonOrder && (projectData.commonOrderParties?.length ?? 0) > 0;
    const effectivePetitioners = isCommonOrder
        ? (projectData.commonOrderParties[0].petitioners ?? [])
        : projectData.petitioners;
    const effectiveRespondents = isCommonOrder
        ? (projectData.commonOrderParties[0].respondents ?? [])
        : projectData.respondents;

    const petHeader = getPartyHeader(effectivePetitioners);
    const resHeader = getPartyHeader(effectiveRespondents);

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    // Helper: build the 4-column parties table from any petitioners + respondents arrays
    const buildPartiesTable = (
        petitioners: typeof projectData.petitioners,
        respondents: typeof projectData.respondents,
    ) => {
        const petRows = petitioners.map((p, i) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [
                    new Paragraph({ children: [smartTextRun({ text: p.name, bold: true })] }),
                    new Paragraph(p.address),
                ] }),
                new TableCell({ children: [new Paragraph({ text: p.positionInEarlierCourt, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: petitioners.length === 1 ? "Petitioner" : `Petitioner No. ${i + 1}`, alignment: AlignmentType.CENTER })] }),
            ]
        }));
        const resRows = respondents.map((r, i) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${i + 1}.`, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [
                    new Paragraph({ children: [smartTextRun({ text: r.name, bold: true })] }),
                    new Paragraph(r.address),
                ] }),
                new TableCell({ children: [new Paragraph({ text: r.positionInEarlierCourt, alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ text: respondents.length === 1 ? "Respondent" : `Respondent No. ${i + 1}`, alignment: AlignmentType.CENTER })] }),
            ]
        }));
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [5, 45, 25, 25].map(v => v * 100),
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "S.No.", bold: true })], alignment: AlignmentType.CENTER })],
                            rowSpan: 2,
                            verticalAlign: VerticalAlign.CENTER
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "Name and Address", bold: true })], alignment: AlignmentType.CENTER })],
                            rowSpan: 2,
                            verticalAlign: VerticalAlign.CENTER
                        }),
                        new TableCell({
                            children: [new Paragraph({ children: [smartTextRun({ text: "Position of Parties", bold: true })], alignment: AlignmentType.CENTER })],
                            columnSpan: 2,
                        }),
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Before the High Court/ Earlier Court", bold: true })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ children: [new Paragraph({ children: [smartTextRun({ text: "Before this Hon'ble Court", bold: true })], alignment: AlignmentType.CENTER })] }),
                    ]
                }),
                ...petRows,
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ text: "Versus", alignment: AlignmentType.CENTER })],
                            columnSpan: 4,
                        }),
                    ]
                }),
                ...resRows
            ],
        });
    };

    // Build the BETWEEN blocks (either single or multiple for common order)
    const betweenBlocks: (Paragraph | Table)[] = [];
    if (isCommonOrder) {
        const currentYear = new Date().getFullYear();
        const mainOrder = projectData.impugnedOrders?.[0];
        const courtName = mainOrder?.court === 'Other' ? mainOrder?.customCourt : mainOrder?.court;
        const orderDate = mainOrder?.date ? format(new Date(mainOrder.date), "dd.MM.yyyy") : '[date]';

        // Title block: IN THE SUPREME COURT OF INDIA + jurisdiction (shown once)
        betweenBlocks.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 240, after: 240 },
                children: [smartTextRun({ text: "IN THE SUPREME COURT OF INDIA", size: 28 })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 240, after: 240 },
                children: [smartTextRun({ text: `${projectData.caseType} Appellate Jurisdiction`, italics: true, size: 28 })],
            }),
        );

        // One block per common order group
        for (const group of projectData.commonOrderParties) {
            const groupCaseNumber = group.caseNumber || '[Case No.]';
            const groupIoText = mainOrder
                ? ` the Impugned ${mainOrder.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${groupCaseNumber}`
                : ioText;

            betweenBlocks.push(
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { line: 240, after: 240 },
                    children: [smartTextRun({ text: `Special Leave Petition (${projectData.caseType}) No. _______ of ${currentYear}`, bold: true, size: 28 })],
                }),
                new Paragraph({
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: 720, right: 720 },
                    spacing: { line: 240, after: 360 },
                    children: [smartTextRun({ text: `Against${groupIoText}` })],
                }),
                new Paragraph({ text: "BETWEEN:", spacing: { after: 0, before: 0, line: 240 } }),
                buildPartiesTable(group.petitioners ?? [], group.respondents ?? []),
                new Paragraph(""),
            );
        }
    } else {
        betweenBlocks.push(
            ...createSlpHeader(projectData.caseType, ioText),
            new Paragraph({ text: "BETWEEN:", spacing: { after: 0, before: 0, line: 240 } }),
            buildPartiesTable(effectivePetitioners, effectiveRespondents),
            new Paragraph(""),
        );
    }

    const hcAction = projectData.impugnedOrders.map(o => o.effect).join('; ');
    const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const lastNonAdPNumber = nonAdAnnexures.length;

    let para1A;
    const { intraCourtAppealStatus, intraCourtAppealReason } = projectData;
    const para1AIndent = { indent: { left: 720, hanging: 360 } };
    if (intraCourtAppealStatus === 'no_appeal_lies') {
        para1A = new Paragraph({
            text: "1A. The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court, but no intra-court appeal lies.",
            ...para1AIndent,
        });
    } else if (intraCourtAppealStatus === 'appeal_lies_but') {
        para1A = new Paragraph({
            text: `1A. The Impugned Order(s) is/are passed by a Ld. Single Judge of the High Court and an intra-court appeal lies. However, ${intraCourtAppealReason || '[reason not provided]'}`,
            ...para1AIndent,
        });
    } else {
        para1A = new Paragraph({
            text: `1A. No LPA or WA lies against${ioText}.`,
            ...para1AIndent,
        });
    }
    
    let allNumberingConfigs: any[] = [];
    
    const getAlphabeticalLabel = (i: number): string => {
        const charCodeA = 'A'.charCodeAt(0);
        const numAlphabets = 26;
        let label = '';
        let num = i;
    
        do {
            label = String.fromCharCode(charCodeA + (num % numAlphabets)) + label;
            num = Math.floor(num / numAlphabets) - 1;
        } while (num >= 0);
    
        return label;
    };

    const questionsOfLawRows = projectData.questionsOfLaw
        .filter(qol => qol.particulars.trim() !== '')
        .map((qol, index) => {
            const { paragraphs, numbering } = parseHtml(qol.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: paragraphs,
                        borders: noBorders,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

    const questionsOfLawTable = questionsOfLawRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: questionsOfLawRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    const groundsRows = projectData.grounds
        .filter(g => g.particulars.trim() !== '')
        .map((g, index) => {
            const { paragraphs, numbering } = parseHtml(g.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: paragraphs,
                        borders: noBorders,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

    const groundsTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: groundsRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    });
    
    const interimGroundsRows = projectData.interimReliefGrounds
        .filter(ig => ig.particulars.trim() !== '')
        .map((ig, index) => {
            const { paragraphs, numbering } = parseHtml(ig.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: paragraphs,
                        borders: noBorders,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

    const interimGroundsTable = interimGroundsRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: interimGroundsRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    const interimPrayersRows = projectData.interimReliefPrayers
        .filter(ip => ip.particulars.trim() !== '')
        .map((ip, index) => {
            const { paragraphs, numbering } = parseHtml(ip.particulars);
            if (numbering.length > 0) {
                allNumberingConfigs.push(...numbering);
            }
            return new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: `${getAlphabeticalLabel(index).toLowerCase()}.`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: paragraphs,
                        borders: noBorders,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ],
            });
        });

    const interimPrayersTable = interimPrayersRows.length > 0 ? new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: interimPrayersRows,
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    }) : null;

    const mainPrayersTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: 'a.', style: "Normal" })],
                        borders: noBorders,
                        width: { size: 5, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: `Grant special leave to appeal against${ioText}; and`, style: "Normal" })],
                        borders: noBorders,
                        width: { size: 95, type: WidthType.PERCENTAGE },
                    }),
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: 'b.', style: "Normal" })],
                        borders: noBorders,
                    }),
                    new TableCell({
                        children: [new Paragraph({ children: [smartTextRun("Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.")], style: "Normal" })],
                        borders: noBorders,
                    }),
                ]
            })
        ],
        borders: noBorders,
        indent: {
            size: 720, // 0.5 inch
            type: WidthType.DXA,
        },
    });
    
    let interimGroundsSection: (Paragraph | Table)[] = [];
    let interimPrayersSection: (Paragraph | Table)[] = [];

    if (projectData.wantsInterimRelief) {
        interimGroundsSection = [
            new Paragraph({
                children: [
                    smartTextRun({ text: "GROUNDS FOR INTERIM RELIEF: ", bold: true }),
                    smartTextRun("Interim relief is sought on the following grounds:")
                ],
                numbering: { reference: "slp-intro-list-6", level: 0 },
            }),
            ...(interimGroundsTable ? [interimGroundsTable] : []),
        ];
        interimPrayersSection = [
            new Paragraph({
                children: [
                    smartTextRun({ text: "PRAYERS FOR INTERIM RELIEF: ", bold: true }),
                    smartTextRun("In view of the foregoing submissions, the Petitioner most respectfully prays that pending the final outcome of the present SLP, this Hon'ble Court may be pleased to:")
                ],
                numbering: { reference: "slp-intro-list-8", level: 0 },
            }),
            ...(interimPrayersTable ? [interimPrayersTable] : []),
        ];
    } else {
        interimGroundsSection = [
            new Paragraph({
                children: [
                    smartTextRun({ text: "GROUNDS FOR INTERIM RELIEF: ", bold: true }),
                    smartTextRun("NIL.")
                ],
                numbering: { reference: "slp-intro-list-6", level: 0 },
            }),
        ];
        interimPrayersSection = [
            new Paragraph({
                children: [
                    smartTextRun({ text: "PRAYERS FOR INTERIM RELIEF: ", bold: true }),
                    smartTextRun("NIL.")
                ],
                numbering: { reference: "slp-intro-list-8", level: 0 },
            }),
        ];
    }

    const makeSlpListConfig = (reference: string, start = 1) => ({
        reference,
        levels: [{ level: 0, format: "decimal" as const, text: "%1.", alignment: AlignmentType.START, start, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    });

    const uniqueNumberingConfigs = [
        ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
        makeSlpListConfig("slp-intro-list"),
        makeSlpListConfig("slp-intro-list-3", 3),
        makeSlpListConfig("slp-intro-list-6", 6),
        makeSlpListConfig("slp-intro-list-7", 7),
        makeSlpListConfig("slp-intro-list-8", 8),
    ];

    const { advocate } = projectData;
    let advocateDetailsTable: Table | null = null;
    const paraSpacing = { after: 0, line: 240 };
    if (advocate.wantsDrawnBy || advocate.wantsSettledBy) {
        advocateDetailsTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            children: [
                                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled on: ${advocate.settledByDate ? format(advocate.settledByDate, 'dd.MM.yyyy') : ''}`, spacing: paraSpacing })] : []),
                                ...(advocate.wantsSettledBy ? [new Paragraph({ text: `Settled by: ${advocate.settledByName}`, spacing: paraSpacing })] : [])
                            ],
                            borders: noBorders,
                        }),
                        new TableCell({
                            children: [
                                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn on: ${advocate.drawnByDate ? format(advocate.drawnByDate, 'dd.MM.yyyy') : ''}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : []),
                                ...(advocate.wantsDrawnBy ? [new Paragraph({ text: `Drawn by: ${advocate.drawnByName}`, alignment: AlignmentType.RIGHT, spacing: paraSpacing })] : [])
                            ],
                             borders: noBorders,
                        }),
                    ],
                }),
            ],
        });
    }

    const sections: ISectionOptions[] = [{
        properties: { page: { margin: defaultMargins } },
        children: [
            ...betweenBlocks,
            new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                    smartTextRun("To"),
                    new TextRun({ break: 1 }),
                    smartTextRun("The Hon'ble Chief Justice of India and"),
                    new TextRun({ break: 1 }),
                    smartTextRun("His Companion Justices of"),
                    new TextRun({ break: 1 }),
                    smartTextRun("The Hon'ble Supreme Court of India"),
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [ smartTextRun({ text: "It is most respectfully submitted that:", bold: true }) ]
            }),
            new Paragraph({
                text: convertToSmartQuotes(`By this Special Leave Petition, leave is sought under Article 136 of the Constitution of India to appeal against${ioText}, by which ${hcAction}${hcAction && hcAction.match(/[.!?]$/) ? '' : '.'}`),
                numbering: { reference: "slp-intro-list", level: 0 },
            }),
            para1A,
            new Paragraph({
                children: [
                    smartTextRun({ text: "QUESTIONS OF LAW: ", bold: true }),
                    smartTextRun("The following questions of law arise for this Hon'ble Court's consideration in the present SLP:")
                ],
                numbering: { reference: "slp-intro-list", level: 0 },
            }),
            ...(questionsOfLawTable ? [questionsOfLawTable] : []),
             new Paragraph({
                children: [
                    smartTextRun({ text: "DECLARATION IN TERMS OF RULE 3(2): ", bold: true }),
                    smartTextRun(`No other petition seeking Special Leave to Appeal against${ioText} has been filed by the Petitioner(s).`)
                ],
                numbering: { reference: "slp-intro-list-3", level: 0 },
            }),
            new Paragraph({
                children: [
                    smartTextRun({ text: "DECLARATION IN TERMS OF RULE 5: ", bold: true }),
                    smartTextRun(`Annexures P-1 to P-${lastNonAdPNumber} produced along with the Special Leave Petition are true copies of the pleadings/documents which formed part of the Courts below.`)
                ],
                numbering: { reference: "slp-intro-list-3", level: 0 },
            }),
            new Paragraph({
                children: [
                    smartTextRun({ text: "GROUNDS: ", bold: true }),
                    smartTextRun("This Special Leave Petition is preferred on the following grounds taken without prejudice against each other:")
                ],
                numbering: { reference: "slp-intro-list-3", level: 0 },
            }),
            groundsTable,
            ...interimGroundsSection,
            new Paragraph({
                children: [
                    smartTextRun({ text: "MAIN PRAYERS: ", bold: true }),
                    smartTextRun("In view of the foregoing submissions, the Petitioner most respectfully prays that this Hon'ble Court may be pleased to:")
                ],
                numbering: { reference: "slp-intro-list-7", level: 0 },
            }),
            mainPrayersTable,
            ...interimPrayersSection,
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [smartTextRun({ text: "And for this act of kindness, the humble Petitioner(s) shall ever pray.", italics: true })]
            }),
            new Paragraph(""),
            ...(advocateDetailsTable ? [advocateDetailsTable, new Paragraph("")] : [new Paragraph("")]),
            ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]"),
            new Paragraph({ children: [new PageBreak()] }),
            ...createSlpHeader(projectData.caseType, ioText),
            ...createPartiesHeader(petHeader, resHeader),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [smartTextRun({ text: "CERTIFICATE", bold: true })],
            }),
            new Paragraph({
                children: [smartTextRun("Certified that the SLP is confined only to the pleadings before the Court whose judgment is challenged and the other documents relied upon in those proceedings. No additional facts, documents or grounds have been taken or relied upon in the SLP except those facts/documents for which an application for permission to file the same has been filed. The documents/annexures attached to the SLP are necessary to answer the questions of law raised and/or to make out the grounds urged in the SLP for consideration of this Hon'ble Court. This certificate is given on the basis of instructions given by the Petitioner whose affidavit is filed in support of the SLP.")],
                spacing: { line: 240 },
                alignment: AlignmentType.JUSTIFIED,
            }),
            new Paragraph(""), // Spacer
            ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]"),
        ]
    }];

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: defaultStyles,
        sections: sections,
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `SLP.docx` };
}

export async function generateAppendixDocx(projectData: DraftoProject) {
    if (!projectData.wantsAppendix || !projectData.useManualAppendix || !projectData.appendixManualEntry) {
        return { success: false, message: "Appendix not wanted or not provided." };
    }
    
    const appendixResult = parseHtml(projectData.appendixManualEntry);
    const uniqueNumberingConfigs = appendixResult.numbering.filter(
        (v, i, a) => a.findIndex(t => t.reference === v.reference) === i
    );
    
    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: defaultStyles,
        sections: [{
            properties: { page: { margin: defaultMargins } },
            children: [
                new Paragraph({
                    children: [smartTextRun({ text: `APPENDIX: RELEVANT PROVISIONS OF THE ${(projectData.appendixDescription || '').toUpperCase()}`, bold: true })],
                    alignment: AlignmentType.CENTER
                }),
                new Paragraph(""),
                ...appendixResult.paragraphs
            ]
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Appendix.docx` };
}

const getShortIaTitle = (iaIdentifier: string, iaTitle: string): string => {
    switch (iaIdentifier) {
        case 'condonationOfDelay': return 'IA-CoD';
        case 'exemptionCertifiedCopy': return 'IA-CC';
        case 'exemptionOfficialTranslation': return 'IA-OT';
        case 'exemptionFromSurrendering': return 'IA-surr';
        case 'additionalDocuments': return 'IA-AD';
        default:
            // Sanitize and shorten custom title
            const sanitized = iaTitle.replace(/[^a-zA-Z0-9]/g, '_').replace(/Application_for_/, '');
            return `IA-${sanitized.slice(0, 20)}`;
    }
}

export async function generateIaDocx(
    projectData: DraftoProject,
    iaIdentifier: string,
    customText?: string,
    iaAnnexurePageRanges?: Map<string, {start: number, end: number}>,
) {
    const ioText = ` ${calculateIoText(projectData)}`;
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const { advocate } = projectData;

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    let allNumberingConfigs: any[] = [];
    const getAlphabeticalLabel = (i: number): string => {
        const charCodeA = 'A'.charCodeAt(0);
        const numAlphabets = 26;
        let label = '';
        let num = i;
    
        do {
            label = String.fromCharCode(charCodeA + (num % numAlphabets)) + label;
            num = Math.floor(num / numAlphabets) - 1;
        } while (num >= 0);
    
        return label;
    };
    
    const makeIaListConfig = (reference: string, start = 1) => ({
        reference,
        levels: [{ level: 0, format: "decimal" as const, text: "%1.", alignment: AlignmentType.START, start, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    });

    const numberingConfig = [
        makeIaListConfig("ia-intro-list"),
        makeIaListConfig("ia-intro-list-3", 3),
    ];
    
    let prayerParagraphs: Paragraph[] = [];
    let iaTitle = "";
    let customTextParagraphs: (Paragraph | Table)[] = [];

    // Helper function to create IA annexure text with page range and period-appending
    const createIaAnnexureText = (aNumber: number, annex: { id?: string; title: string; date?: string }): (TextRun | string)[] => {
        const annexureLabel = `Annexure A-${aNumber}`;
        const pageRange = annex.id ? iaAnnexurePageRanges?.get(annex.id) : undefined;
        let pageRangeText: string;
        if (pageRange) {
            pageRangeText = pageRange.start === pageRange.end
                ? `(p.${pageRange.start})`
                : `(pp.${pageRange.start} to ${pageRange.end})`;
        } else {
            pageRangeText = `(pp.___ to ___)`;
        }
        const parts: (TextRun | string)[] = [
            smartTextRun({ text: `${annexureLabel} ${pageRangeText}`, bold: true }),
            convertToSmartQuotes(` is a ${annex.title}`)
        ];
        if (annex.date) parts.push(convertToSmartQuotes(` dated ${annex.date}`));
        
        // Auto-append period if user forgot (trim trailing whitespace first)
        const lastPart = parts[parts.length - 1];
        if (typeof lastPart === 'string') {
            const trimmed = lastPart.trimEnd();
            parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
        }
        
        return parts;
    };

    const standardIa = standardIaList.find(ia => ia.id === iaIdentifier);
    if(standardIa) {
        iaTitle = standardIa.title;
        let customPrayer = "";
        switch(iaIdentifier) {
            case "condonationOfDelay":
                const delayDays = projectData.standardIas.condonationOfDelay.delayDays > 0 ? projectData.standardIas.condonationOfDelay.delayDays : "__";
                iaTitle = `Application for condonation of delay of ${delayDays} days in filing the SLP`;
                customPrayer = `Condone the delay of ${delayDays} days in filing the accompanying SLP against${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));

                const grounds = projectData.standardIas.condonationOfDelay.grounds;
                
                // Build annexure numbering map for grounds
                const groundsAnnexureMap = new Map<string, number>();
                let aCounter = 1;
                grounds.forEach(g => {
                    if (g.annexures) {
                        g.annexures.forEach(annex => {
                            groundsAnnexureMap.set(annex.id, aCounter++);
                        });
                    }
                });
                
                const groundsRows = grounds
                    .filter(g => g.particulars.trim() !== '')
                    .map((g, index) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars);
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        
                        // Add annexure sentences for this ground
                        if (g.annexures && g.annexures.length > 0) {
                            g.annexures.forEach(annex => {
                                const aNumber = groundsAnnexureMap.get(annex.id);
                                if (aNumber) {
                                    const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                    const textRuns = annexureTextParts.map(part => 
                                        typeof part === 'string' ? smartTextRun(part) : part
                                    );
                                    paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                                }
                            });
                        }
                        
                        return new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                    borders: noBorders, width: { size: 5, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({ children: paragraphs, borders: noBorders, width: { size: 95, type: WidthType.PERCENTAGE } }),
                            ],
                        });
                    });

                const groundsTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    rows: groundsRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });

                customTextParagraphs = [
                    new Paragraph({
                        text: `This application, seeking condonation of delay of ${delayDays} days in filing the accompanying SLP, is preferred on the following grounds:`,
                        numbering: { reference: "ia-intro-list", level: 0 },
                    }),
                    groundsTable
                ];
                break;
            case "exemptionCertifiedCopy":
                iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                customPrayer = `Grant exemption to the Petitioner(s) from filing certified copy of${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                
                let certParaText = `This application seeks exemption from filing certified copy of${ioText}. `;
                if (projectData.standardIas.exemptionCertifiedCopy.hasApplied === 'yes') {
                    const receiptDate = projectData.standardIas.exemptionCertifiedCopy.receiptDate;
                    const formattedDate = receiptDate ? format(new Date(receiptDate), "dd.MM.yyyy") : '[date]';
                    certParaText += `It is most respectfully submitted that the Petitioner(s) have applied for a certified copy of${ioText}. Annexure-A is a true copy of the Receipt dated ${formattedDate} reflecting the application for certified copy made by/on behalf of the Petitioner(s). `;
                } else {
                    certParaText += `It is most respectfully submitted that the Petitioner(s) have not been able to apply for a certified copy of${ioText}. ${projectData.standardIas.exemptionCertifiedCopy.reasonForNotApplying || ''} `;
                }
                certParaText += "In the circumstances, it is prayed that an exemption from filing the certified copy may be granted. The Petitioner(s) undertake(s) to produce the certified copy as and when made available to the Petitioner(s) and/or directed by this Hon'ble Court.";
                
                customTextParagraphs = [new Paragraph({ children: [smartTextRun(certParaText)], numbering: { reference: "ia-intro-list", level: 0 } })];
                break;
            case "additionalDocuments":
                 iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                 const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
                 const adAnnexures = allAnnexures.filter(annex => annex.isAdditionalDocument);
                 const annexureNumberingMap = new Map<string, number>();
                 let pCounter = 1;
                 allAnnexures.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
                 adAnnexures.forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));

                 const adNumbers = adAnnexures.map(a => annexureNumberingMap.get(a.id)).filter((n): n is number => n !== undefined).sort((a,b) => a-b);
                 
                 let adRange = "";
                 if (adNumbers.length > 0) {
                     if (adNumbers.length === 1) {
                         adRange = `Annexure P-${adNumbers[0]}`;
                     } else {
                         const first = adNumbers[0];
                         const last = adNumbers[adNumbers.length - 1];
                         adRange = `Annexures P-${first} to P-${last}`;
                     }
                 }
                 customPrayer = `Permit the Petitioner(s) to place on record the additional document(s) marked as ${adRange}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                
                const createAdAnnexureText = (pNumber: number, annex: Annexure): (TextRun | string)[] => {
                    const annexureLabel = `Annexure P-${pNumber}`;
                    const parts: (TextRun | string)[] = [
                        smartTextRun({ text: `${annexureLabel} (pp.___ to ___)`, bold: true }),
                        convertToSmartQuotes(` is a ${annex.copyType || '[description]'} of`)
                    ];
                    if (annex.title) parts.push(convertToSmartQuotes(` ${annex.title}`));
                    if (annex.date) parts.push(convertToSmartQuotes(` dated ${annex.date}`));
                    if (annex.customText) parts.push(convertToSmartQuotes(` ${annex.customText}`));
                    
                    // Auto-append period if user forgot (trim trailing whitespace first)
                    const lastPart = parts[parts.length - 1];
                    if (typeof lastPart === 'string') {
                        const trimmed = lastPart.trimEnd();
                        parts[parts.length - 1] = trimmed.match(/[.!?]$/) ? trimmed : trimmed + '.';
                    }
                    
                    return parts;
                };

                const adAnnexureRows = adAnnexures.map((annex, index) => {
                    const pNumber = annexureNumberingMap.get(annex.id);
                    if (!pNumber) return null;
                    
                    const partsArray = createAdAnnexureText(pNumber, annex);
                    const textRuns = partsArray.map(part => 
                        typeof part === 'string' ? smartTextRun(part) : part
                    );

                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                borders: noBorders, width: { size: 5, type: WidthType.PERCENTAGE },
                            }),
                            new TableCell({
                                children: [new Paragraph({ children: textRuns, style: "Normal" })],
                                borders: noBorders, width: { size: 95, type: WidthType.PERCENTAGE },
                            }),
                        ],
                    });
                }).filter((row): row is TableRow => row !== null);

                const adAnnexuresTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    rows: adAnnexureRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });

                customTextParagraphs = [
                    new Paragraph({
                        text: "This application seeks permission to place on record the following additional facts and documents, which are necessary and proper for the adjudication of the accompanying SLP:",
                        numbering: { reference: "ia-intro-list", level: 0 },
                    }),
                    adAnnexuresTable,
                ];

                // Append user-provided grounds/averments as numbered paragraphs after the annexures table
                const adGrounds = (projectData.standardIas as any).additionalDocumentsGrounds || [];
                adGrounds
                    .filter((g: any) => g.particulars && g.particulars.trim() !== '')
                    .forEach((g: any) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars, undefined, { reference: "ia-intro-list", level: 0 });
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        paragraphs.forEach(p => {
                            customTextParagraphs.push(p);
                        });
                    });

                break;
            case "exemptionOfficialTranslation":
                const allAnnexuresForTranslation: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
                const annexureNumberingMapForTranslation = new Map<string, number>();
                let pCounterForTranslation = 1;
                allAnnexuresForTranslation.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMapForTranslation.set(annex.id, pCounterForTranslation++));
                allAnnexuresForTranslation.filter(annex => annex.isAdditionalDocument).forEach(annex => annexureNumberingMapForTranslation.set(annex.id, pCounterForTranslation++));

                const translatedAnnexures = allAnnexuresForTranslation
                    .filter(annex => annex.copyType === 'translated copy' || annex.copyType === 'true and translated copy')
                    .map(annex => annexureNumberingMapForTranslation.get(annex.id))
                    .filter(Boolean)
                    .map(pNumber => `P-${pNumber}`);
                
                let annexureList = projectData.standardIas.exemptionOfficialTranslation.reason || 'the annexures';
                 if (translatedAnnexures.length > 0) {
                    const last = translatedAnnexures.pop();
                    annexureList = translatedAnnexures.length > 0
                        ? `Annexures ${translatedAnnexures.join(', ')} and ${last}`
                        : `Annexure ${last}`;
                }

                iaTitle = `Application for exemption from filing Official Translation(s) of ${annexureList}`;
                customPrayer = `Grant exemption to the Petitioner(s) from filing Official Translation(s) of ${annexureList}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                customTextParagraphs = [new Paragraph({ children: [smartTextRun(`This application seeks exemption from filing Official Translation(s) of ${annexureList}. It is prayed that in view of the urgency and the facts and circumstances of this case, exemption from filing Official Translation(s) may be granted.`)], numbering: { reference: "ia-intro-list", level: 0 } })];
                break;
            case "exemptionFromSurrendering":
                iaTitle = standardIaList.find(ia => ia.id === iaIdentifier)?.title || iaTitle;
                customPrayer = `Grant exemption to the Petitioner(s) from surrendering pursuant to${ioText}; and`;
                prayerParagraphs.push(new Paragraph({ children: [smartTextRun(customPrayer)], style: "Normal" }));
                const surrenderingGrounds = projectData.standardIas.exemptionFromSurrendering?.grounds || [];
                
                // Build annexure numbering map for surrendering grounds
                const surrenderingAnnexureMap = new Map<string, number>();
                let sCounter = 1;
                surrenderingGrounds.forEach(g => {
                    if (g.annexures) {
                        g.annexures.forEach(annex => {
                            surrenderingAnnexureMap.set(annex.id, sCounter++);
                        });
                    }
                });
                
                const surrenderingGroundsRows = surrenderingGrounds
                    .filter(g => g.particulars.trim() !== '')
                    .map((g, index) => {
                        const { paragraphs, numbering } = parseHtml(g.particulars);
                        if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                        
                        // Add annexure sentences for this ground
                        if (g.annexures && g.annexures.length > 0) {
                            g.annexures.forEach(annex => {
                                const aNumber = surrenderingAnnexureMap.get(annex.id);
                                if (aNumber) {
                                    const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                    const textRuns = annexureTextParts.map(part => 
                                        typeof part === 'string' ? smartTextRun(part) : part
                                    );
                                    paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                                }
                            });
                        }
                        
                        return new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                    borders: noBorders, width: { size: 5, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({ children: paragraphs, borders: noBorders, width: { size: 95, type: WidthType.PERCENTAGE } }),
                            ],
                        });
                    });

                const surrenderingGroundsTable = new Table({
                    width: { size: 91.66, type: WidthType.PERCENTAGE },
                    rows: surrenderingGroundsRows, borders: noBorders,
                    indent: { size: 720, type: WidthType.DXA },
                });
                
                customTextParagraphs = [
                    new Paragraph({
                        text: `This application, seeking exemption from surrendering pursuant to${ioText}, is preferred on the following grounds:`,
                        numbering: { reference: "ia-intro-list", level: 0 },
                    }),
                    surrenderingGroundsTable
                ];
                break;
        }
    } else {
        // Handle custom IAs
        const customIa = projectData.customIas.find(ia => ia.id === iaIdentifier);
        if (customIa) {
            iaTitle = customIa.title;

            // Build annexure numbering map for custom IA grounds
            const customAnnexureMap = new Map<string, number>();
            let cCounter = 1;
            customIa.grounds.forEach(g => {
                if (g.annexures) {
                    g.annexures.forEach(annex => {
                        customAnnexureMap.set(annex.id, cCounter++);
                    });
                }
            });

            // Handle Grounds
            const groundsRows = customIa.grounds
                .filter(g => g.particulars.trim() !== '')
                .map((g, index) => {
                    const { paragraphs, numbering } = parseHtml(g.particulars);
                    if (numbering.length > 0) allNumberingConfigs.push(...numbering);
                    
                    // Add annexure sentences for this ground
                    if (g.annexures && g.annexures.length > 0) {
                        g.annexures.forEach(annex => {
                            const aNumber = customAnnexureMap.get(annex.id);
                            if (aNumber) {
                                const annexureTextParts = createIaAnnexureText(aNumber, annex);
                                const textRuns = annexureTextParts.map(part => 
                                    typeof part === 'string' ? smartTextRun(part) : part
                                );
                                paragraphs.push(new Paragraph({ children: textRuns, style: "Normal" }));
                            }
                        });
                    }
                    
                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({ text: `${getAlphabeticalLabel(index)}.`, style: "Normal" })],
                                borders: noBorders, width: { size: 5, type: WidthType.PERCENTAGE },
                            }),
                            new TableCell({ children: paragraphs, borders: noBorders, width: { size: 95, type: WidthType.PERCENTAGE } }),
                        ],
                    });
                });

            const groundsTable = new Table({
                width: { size: 91.66, type: WidthType.PERCENTAGE },
                rows: groundsRows, borders: noBorders,
                indent: { size: 720, type: WidthType.DXA },
            });

            customTextParagraphs = [
                new Paragraph({
                    text: `The present application is filed on the following grounds:`,
                    numbering: { reference: "ia-intro-list", level: 0 },
                }),
                groundsTable
            ];

            // Handle Prayers
            customIa.prayers.forEach(p => {
                 const { paragraphs } = parseHtml(p.particulars);
                 prayerParagraphs.push(...paragraphs);
            });
        }
    }

    const uniqueNumberingConfigs = [
        ...allNumberingConfigs.filter((v, i, a) => a.findIndex(t => t.reference === v.reference) === i),
        ...numberingConfig
    ];

    const prayerTableRows = prayerParagraphs.map((p, index) => {
        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ text: `${getAlphabeticalLabel(index).toLowerCase()}.`, style: "Normal" })],
                    borders: noBorders,
                    width: { size: 5, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                    children: [p],
                    borders: noBorders,
                    width: { size: 95, type: WidthType.PERCENTAGE },
                }),
            ]
        });
    });
    
    // Add the "any other order" prayer for standard IAs
    if (standardIa) {
        prayerTableRows.push(new TableRow({
            children: [
                 new TableCell({
                    children: [new Paragraph({ text: `${getAlphabeticalLabel(prayerTableRows.length).toLowerCase()}.`, style: "Normal" })],
                    borders: noBorders,
                }),
                new TableCell({
                    children: [new Paragraph({ children: [smartTextRun("Pass any such other or further order(s) as this Hon'ble Court may deem fit in the facts and circumstances of this case.")], style: "Normal" })],
                    borders: noBorders,
                }),
            ]
        }));
    }

    const prayerTable = new Table({
        width: { size: 91.66, type: WidthType.PERCENTAGE },
        rows: prayerTableRows,
        borders: noBorders,
        indent: { size: 720, type: WidthType.DXA },
    });

    const finalCustomTextParagraphs = customTextParagraphs.map((p) => {
        if (p instanceof Paragraph) {
             if (!p.properties.numbering) {
                 p.properties.numbering = { reference: "ia-intro-list", level: 0 };
             }
        }
        return p;
    });

    const doc = new Document({
        numbering: {
            config: uniqueNumberingConfigs,
        },
        styles: defaultStyles,
        sections: [{
            properties: { page: { margin: defaultMargins } },
            children: [
                ...createIaHeader(projectData.caseType),
                ...createPartiesHeader(petHeader, resHeader),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [smartTextRun({ text: iaTitle.toUpperCase(), bold: true })]
                }),
                new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [
                        smartTextRun("To"),
                        new TextRun({ break: 1 }),
                        smartTextRun("The Hon'ble Chief Justice of India and"),
                        new TextRun({ break: 1 }),
                        smartTextRun("His Companion Justices of"),
                        new TextRun({ break: 1 }),
                        smartTextRun("The Hon'ble Supreme Court of India"),
                    ]
                }),
                 new Paragraph({
                    alignment: AlignmentType.LEFT,
                    children: [ smartTextRun({ text: "It is most respectfully submitted that:", bold: true }) ]
                }),
                new Paragraph({
                    text: convertToSmartQuotes(`The accompanying Special Leave Petition has been filed against${ioText}. The contents of the Special Leave Petition may kindly be treated as part and parcel of this application and are not being repeated herein for the sake of brevity.`),
                    numbering: { reference: "ia-intro-list", level: 0 },
                }),
                ...finalCustomTextParagraphs,
                 new Paragraph({
                    text: convertToSmartQuotes("No prejudice would be caused to the Respondent(s) if this application were allowed. On the other hand, irreparable injury would be caused to the Petitioner(s) if the application were not allowed."),
                    numbering: { reference: "ia-intro-list-3", level: 0 },
                }),
                new Paragraph({
                    text: convertToSmartQuotes("This application is filed in good faith and in the interests of justice."),
                    numbering: { reference: "ia-intro-list-3", level: 0 },
                }),
                 new Paragraph({
                    children: [
                        smartTextRun({ text: "PRAYERS", bold: true }),
                        smartTextRun({ text: ": In view of the foregoing averments, it is most respectfully prayed that this Hon'ble Court may be pleased to:" })
                    ],
                    numbering: { reference: "ia-intro-list-3", level: 0 },
                }),
                prayerTable,
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [smartTextRun({ text: "And for this act of kindness, the humble Petitioner(s) shall ever pray.", italics: true })]
                }),
                new Paragraph(""),
                ...createFiledByTable(advocate.filingDate, advocate.aorName || "[AoR Name]"),
            ]
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    const fileName = `${getShortIaTitle(iaIdentifier, iaTitle)}.docx`;
    return { success: true, docx: b64string, fileName: fileName };
}

export async function generateFilingMemoDocx(projectData: DraftoProject) {
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const iaList = getIaList(projectData);
    const allAnnexures = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const lastAnnexureNumber = allAnnexures.length;

    const memoRows = [
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: "1.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "Special Leave Petition with Certificate and Affidavit", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: "2.", alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: `Annexures P-1 to P-${lastAnnexureNumber}`, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        }),
        ...iaList.map((ia, index) => new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${index + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: ia.title, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        })),
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: `${iaList.length + 3}.`, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "Vakalatnama(s)", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                new TableCell({ children: [new Paragraph({ text: "", spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
            ]
        })
    ];

    const doc = new Document({
        styles: defaultStyles,
        sections: [{
            properties: { page: { margin: defaultMargins } },
            children: [
                ...createSlpHeader(projectData.caseType, ` ${calculateIoText(projectData)}`),
                ...createPartiesHeader(petHeader, resHeader),
                new Paragraph({
                    text: "FILING MEMO",
                    alignment: AlignmentType.CENTER,
                    bold: true,
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    columnWidths: [5, 65, 15, 15].map(v => v * 100),
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph({ text: "S. No.", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Particulars", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Copies", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                                new TableCell({ children: [new Paragraph({ text: "Court Fee", bold: true, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })], verticalAlign: VerticalAlign.CENTER, margins: defaultCellMargins }),
                            ],
                        }),
                        ...memoRows,
                    ]
                }),
                new Paragraph(""),
                ...createFiledByTable(projectData.advocate.filingDate, projectData.advocate.aorName || "[AoR Name]"),
            ],
        }]
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `MoP.docx` };
}

export async function generateVakalatnamaDocx(projectData: DraftoProject) {
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const { caseType, advocate } = projectData;
    const aorName = advocate.aorName || "[AoR Name]";
    const currentDate = format(new Date(), "dd.MM.yyyy");
    const currentYear = new Date().getFullYear();

    const validPetitioners = projectData.petitioners.filter(p => p.name.trim() !== '');

    if (validPetitioners.length === 0) {
        return { success: false, message: "No petitioners found to generate Vakalatnama." };
    }

    const vakalatnamaStyles = {
        paragraphStyles: [{
            id: "VakaNormal",
            name: "VakaNormal",
            basedOn: "Normal",
            next: "Normal",
            run: { font: "Times New Roman", size: 22 }, // 11pt
            paragraph: { spacing: { after: 0, line: 240 } }, // Single line spacing
        }],
    };

    const noBorders = {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    };

    const sections: ISectionOptions[] = [];

    validPetitioners.forEach((petitioner, index) => {
        const petitionerPosition = validPetitioners.length === 1 ? "Petitioner" : `Petitioner No. ${index + 1}`;
        const children: (Paragraph | Table)[] = [
            new Paragraph({ text: "IN THE SUPREME COURT OF INDIA", alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({ text: `${caseType} Appellate Jurisdiction`, alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                style: "VakaNormal",
                children: [
                    smartTextRun({
                        text: `Special Leave Petition (${caseType}) No. _______ of ${currentYear}`,
                        bold: true,
                    }),
                ],
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            ...createPartiesHeader(petHeader, resHeader).map(p => {
                if (p instanceof Paragraph) {
                    p.properties.style = "VakaNormal";
                }
                return p;
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ children: [smartTextRun({ text: "VAKALATNAMA", bold: true })], alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({
                children: [
                    smartTextRun({ text: convertToSmartQuotes(`I, ${petitioner.name}, ${petitionerPosition} in this Special Leave Petition, hereby appoint and retain `) }),
                    smartTextRun({ text: aorName, bold: true }),
                    smartTextRun({ text: convertToSmartQuotes(`, Advocate on Record of the Supreme Court, to act and appear for me in this petition and, on my behalf, to conduct and prosecute the same and all proceedings that may be taken in respect of any application connected with the same or any decree/order passed therein, including proceedings in taxation and application for review, to file and obtain return of documents, and to deposit and receive money on my behalf in the said petition and in any application for review, and to represent me and to take all necessary steps on my behalf in the above matter. I agree to ratify all acts done by the aforesaid Advocate in pursuance of this authority.`) }),
                ],
                style: "VakaNormal",
                alignment: AlignmentType.JUSTIFIED,
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: `Date: ${currentDate}`, style: "VakaNormal" })], borders: noBorders }),
                        new TableCell({ 
                            children: [
                                new Paragraph({ 
                                    children: [smartTextRun({ text: `${petitioner.name} (${petitionerPosition})`, bold: true })], 
                                    style: "VakaNormal", 
                                    alignment: AlignmentType.RIGHT 
                                })
                            ], 
                            borders: noBorders 
                        }),
                    ],
                })],
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ text: "☐ This Vakalatnama has been signed by the Petitioner(s) in my presence. I have identified the Petitioner(s) and accepted this Vakalatnama.", style: "VakaNormal" }),
            new Paragraph({ text: "☐ This Vakalatnama has not been signed by the Petitioner(s) in my presence. However, I have satisfied myself as to the due execution of this Vakalatnama and accepted it. The Petitioner(s) have been identified by the following Notary/Advocate: _______________.", style: "VakaNormal" }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ 
                children: [
                    smartTextRun({ text: aorName, bold: true }),
                    smartTextRun({ text: `, Advocate on Record (AoR Code: ${advocate.aorCode || '______'})`, bold: true }),
                ],
                style: "VakaNormal" 
            }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Paragraph({ text: "MEMO OF APPEARANCE", bold: true, alignment: AlignmentType.CENTER, style: "VakaNormal" }),
            new Paragraph({ text: "To,", style: "VakaNormal" }),
            new Paragraph({ text: "    The Registrar,", style: "VakaNormal" }),
            new Paragraph({ text: "    Supreme Court of India", style: "VakaNormal" }),
            new Paragraph({ text: "    New Delhi", style: "VakaNormal" }),
            new Paragraph({ text: "Sir,", style: "VakaNormal" }),
            new Paragraph({ text: "    Please enter my appearance on behalf on the Petitioner(s) in the aforesaid matter.", style: "VakaNormal" }),
            new Paragraph({ text: "", style: "VakaNormal" }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ text: `Date: ${currentDate}`, style: "VakaNormal" })], borders: noBorders }),
                        new TableCell({
                            children: [
                                new Paragraph({ 
                                    children: [smartTextRun({ text: aorName, bold: true })], 
                                    style: "VakaNormal", 
                                    alignment: AlignmentType.RIGHT 
                                }),
                                new Paragraph({ text: "Advocate for the Petitioner(s)", style: "VakaNormal", alignment: AlignmentType.RIGHT }),
                            ],
                            borders: noBorders,
                        }),
                    ],
                })],
            }),
        ];

        if (index < validPetitioners.length - 1) {
            children.push(new Paragraph({ children: [new PageBreak()] }));
        }

        sections.push({
            properties: { page: { margin: defaultMargins } },
            children,
        });
    });

    const doc = new Document({
        styles: vakalatnamaStyles,
        sections: sections,
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Vakalatnama.docx` };
}

export async function generateAffidavitsDocx(projectData: DraftoProject) {
    const { deponent, petitioners, caseType } = projectData;
    const petHeader = getPartyHeader(projectData.petitioners);
    const resHeader = getPartyHeader(projectData.respondents);
    const ioText = ` ${calculateIoText(projectData)}`;
    const allAnnexures = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const lastNonAdPNumber = nonAdAnnexures.length;
    
    const docs = [];

    const affidavitNumbering = {
        reference: "affidavit-numbering",
        levels: [{
            level: 0,
            format: "decimal" as const,
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
    };

    const presentlyAtPart = deponent.location?.trim() ? `, presently at ${deponent.location.trim()}` : '';
    const deponentIntro = `I, ${deponent.name || '[Name]'}, ${deponent.relationship} ${deponent.fatherName || '[Father/Husband Name]'}, aged ${deponent.age || '__'} years, resident of ${deponent.address || '[Address]'}${presentlyAtPart}, do hereby solemnly state and affirm as under:`;

    // 1. SLP Affidavit
    const slpAffidavitChildren = [
        ...createSlpHeader(caseType, ioText),
        new Paragraph(""),
        ...createPartiesHeader(petHeader, resHeader),
        new Paragraph({ children: [new TextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
        new Paragraph(deponentIntro),
        new Paragraph({
            text: `I am the ${deponent.role || '[Role]'} in the present case. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({
            text: `I have read and understood the contents of the accompanying Special Leave Petition including Synopsis and List of Dates from Page B to Page ___ and petition for Special Leave to Appeal at Paragraphs 1 to 8. I say that the contents thereof are true and correct to the best of my knowledge and belief.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({
            text: `Annexures P-1 to P-${lastNonAdPNumber} to the petition are true/translated copies of their respective originals.`,
            numbering: { reference: "affidavit-numbering", level: 0 }
        }),
        new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
        new Paragraph({ children: [new TextRun({ text: "VERIFICATION", bold: true })] }),
        new Paragraph(`Verified at ${deponent.location || '[Location]'} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
        new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
    ];
    
    const slpAffidavitDoc = new Document({
        styles: defaultStyles,
        numbering: { config: [affidavitNumbering] },
        sections: [{ properties: { page: { margin: defaultMargins } }, children: slpAffidavitChildren }]
    });
    docs.push({
        fileName: `Affidavit-SLP.docx`,
        doc: slpAffidavitDoc
    });

    // 2. IA Affidavits
    const iaList = getIaList(projectData);
    iaList.forEach((ia, index) => {
        const iaAffidavitChildren = [
            ...createIaHeader(caseType),
            new Paragraph(""),
            ...createPartiesHeader(petHeader, resHeader),
            new Paragraph({ children: [new TextRun({ text: "AFFIDAVIT", bold: true })], alignment: AlignmentType.CENTER }),
            new Paragraph(deponentIntro),
            new Paragraph({
                text: `I am the ${deponent.role || '[Role]'} in the present case. As such, I am fully conversant with the facts of the case and hence capable to swear to this Affidavit${petitioners.length > 1 ? " on behalf of myself and the other Petitioner(s) as well" : ""}.`,
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({
                text: "I have read and understood the contents of the accompanying application. I say that the contents thereof are true and correct to the best of my knowledge and belief.",
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({
                text: "All annexures to the accompanying application are true/translated copies of their respective originals.",
                numbering: { reference: "affidavit-numbering", level: 0 }
            }),
            new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
            new Paragraph({ children: [new TextRun({ text: "VERIFICATION", bold: true })] }),
            new Paragraph(`Verified at ${deponent.location || '[Location]'} on this ___ day of _______ that the contents of the above affidavit are true and correct to the best of my knowledge and no part of it is false and nothing material has been concealed therefrom.`),
            new Paragraph({ children: [new TextRun({ text: "DEPONENT", bold: true })], alignment: AlignmentType.RIGHT }),
        ];

        const iaAffidavitDoc = new Document({
            styles: defaultStyles,
            numbering: { config: [affidavitNumbering] },
            sections: [{ properties: { page: { margin: defaultMargins } }, children: iaAffidavitChildren }]
        });
        docs.push({
            fileName: `Affidavit-IA-${index + 1}.docx`,
            doc: iaAffidavitDoc
        });
    });

    const generatedDocs = await Promise.all(
        docs.map(async ({ fileName, doc }) => {
            const b64string = await Packer.toBase64String(doc);
            return { success: true, docx: b64string, fileName };
        })
    );

    return { success: true, documents: generatedDocs };
}

export async function generateAdvocateChecklistDocx(projectData: DraftoProject) {
    const { checklist } = projectData;
    
    const rows = checklistQueries.map((item) => {
        const answer = checklist[item.name as keyof typeof checklist];
        const questionLabel = item.label.replace(/^\(\w+\)\s*/, '');
        let numberLabel = "";

        const match = item.label.match(/^\((.*?)\)/);
        if (match) {
            numberLabel = match[0];
        }


        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ text: numberLabel, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
                    width: { size: 10, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
                new TableCell({
                    children: [new Paragraph({ text: questionLabel, spacing: tableParagraphSpacing })],
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
                new TableCell({
                    children: [new Paragraph({ text: answer, alignment: AlignmentType.CENTER, spacing: tableParagraphSpacing })],
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: defaultCellMargins,
                }),
            ],
        });
    });

    const doc = new Document({
        styles: defaultStyles,
        sections: [{
            properties: { page: { margin: defaultMargins } },
            children: [
                new Paragraph({
                    children: [
                        smartTextRun({
                            text: "ADVOCATE'S CHECKLIST",
                            bold: true,
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ 
                                    children: [new Paragraph({ 
                                        children: [smartTextRun({ text: "S. No.", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: tableParagraphSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                                new TableCell({ 
                                    children: [new Paragraph({ 
                                        children: [smartTextRun({ text: "Question", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: tableParagraphSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                                new TableCell({ 
                                    children: [new Paragraph({ 
                                        children: [smartTextRun({ text: "Answer", bold: true })],
                                        alignment: AlignmentType.CENTER,
                                        spacing: tableParagraphSpacing
                                    })],
                                    verticalAlign: VerticalAlign.CENTER,
                                    margins: defaultCellMargins
                                }),
                            ],
                        }),
                        ...rows,
                    ],
                }),
            ],
        }],
    });

    const b64string = await Packer.toBase64String(doc);
    return { success: true, docx: b64string, fileName: `Checklist.docx` };
}

// PDF conversion via Electron main process (IPC)
// The actual conversion logic (Python/AppleScript) runs in electron/ipc/pdf-converter.js
async function convertDocxToPdf(docxBuffer: Uint8Array): Promise<{ pdf: PDFDocument, pageCount: number }> {
    const result = await ipcConvertDocxToPdf(docxBuffer);
    if (!result.success || !result.pdfBase64) {
        throw new Error(result.error || 'PDF conversion failed');
    }
    const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    console.log(`[PDF Conversion] Successfully converted (${pageCount} pages)`);
    return { pdf: pdfDoc, pageCount };
}
export async function generatePdf(formData: FormData, signal?: AbortSignal) {
    const fileMetasString = formData.get('fileMetas') as string;
    const projectDataString = formData.get('projectData') as string;
    const settingsString = formData.get('settings') as string | null;

    if (!fileMetasString || !projectDataString) {
        return { success: false, message: "File metadata or project data is missing." };
    }
    const fileMetas: {id: string, label: string, useSystem: boolean, fileName?: string}[] = JSON.parse(fileMetasString);
    const projectData: DraftoProject = JSON.parse(projectDataString);
    
    // Parse settings (with defaults if not provided)
    const settings = settingsString ? JSON.parse(settingsString) : { annexureLabelBackground: false };
    
    const mergedPdf = await PDFDocument.create();
    const failedDocs: {label: string; reason: string}[] = [];

    // Helper function to generate bookmark text that matches the Index in CI
    const getBookmarkText = (meta: {id: string, label: string}): string | null => {
        // Non-paginated items
        if (meta.id === 'advocateChecklist') return 'Checklist';
        if (meta.id === 'ci') return null; // Cover Page and Index - no bookmark needed
        if (meta.id === 'or') return 'Office Report';
        
        // Paginated items
        if (meta.id === 'lp') return 'Listing Proforma';
        if (meta.id === 'slod') return 'Synopsis and List of Dates';
        
        // Impugned Orders
        if (meta.id.startsWith('impugnedOrder_')) {
            const orderId = meta.id.substring('impugnedOrder_'.length);
            const order = projectData.impugnedOrders?.find(o => o.id === orderId);
            if (order) {
                const courtName = order.court === 'Other' ? order.customCourt : order.court;
                const orderDate = order.date ? format(new Date(order.date), "dd.MM.yyyy") : '[date]';
                const singleIoText = `the Impugned ${order.type || '[Order Type]'}`;
                return `Impugned ${order.type || '[Order Type]'}: True copy of ${singleIoText} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
            }
        }
        
        if (meta.id === 'slp') return 'Special Leave Petition with Certificate and Affidavit';
        if (meta.id === 'slpAffidavit') return null; // Part of SLP
        
        if (meta.id === 'appendix') {
            return `Appendix: Relevant provisions of the ${projectData.appendixDescription || '[Appendix Description]'}`;
        }
        
        // Annexures
        if (meta.id.startsWith('annexure_')) {
            const match = meta.label.match(/Annexure (P-\d+): (.+)/);
            if (match) {
                const annexureNum = match[1];
                const rest = match[2];
                // Check if it's a typed/translated copy
                if (meta.id.endsWith('_typed')) {
                    return `Annexure ${annexureNum}: ${rest}`;
                } else {
                    return `Annexure ${annexureNum}: ${rest}`;
                }
            }
        }

        // IA Annexures
        if (meta.id.startsWith('ia_annexure_')) {
            const match = meta.label.match(/Annexure (A-\d+): (.+)/);
            if (match) {
                const annexureNum = match[1];
                const rest = match[2];
                return `Annexure ${annexureNum}: ${rest}`;
            }
        }

        // Certified Copy Receipt
        if (meta.id === 'certified_copy_receipt') {
            const receiptDate = projectData.standardIas?.exemptionCertifiedCopy?.receiptDate;
            const dateText = receiptDate ? ` dated ${format(new Date(receiptDate), 'dd.MM.yyyy')}` : '';
            return `Annexure-A: True copy of the Receipt of application for certified copy${dateText}`;
        }
        
        // IAs
        if (meta.id.startsWith('ia_') && !meta.id.startsWith('ia_affidavit_') && !meta.id.startsWith('ia_annexure_')) {
            const iaId = meta.id.substring(3);
            const ia = getIaList(projectData).find(i => i.id === iaId);
            if (ia) {
                return `${ia.prefix}: ${ia.title}`;
            }
        }
        
        if (meta.id.startsWith('ia_affidavit_')) return null; // Part of IA
        
        if (meta.id === 'memoOfParties') return 'Memo of Parties';
        if (meta.id === 'filingMemo') return 'Filing Memo';
        if (meta.id === 'vakalatnama') return 'Vakalatnama(s)';
        
        return null;
    };

    // Helper function to add header to first page of annexure
    const addAnnexureHeader = async (pdf: PDFDocument, headerText: string) => {
        if (pdf.getPageCount() === 0) return;
        
        const firstPage = pdf.getPage(0);
        const { width, height } = firstPage.getSize();
        const rotation = firstPage.getRotation().angle;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = 12;
        const textWidth = font.widthOfTextAtSize(headerText, fontSize);
        
        // Position header 0.2 inch (14.4 points) from top
        const topMargin = 14.4; // 0.2 inch = 14.4 points
        
        // Adjust coordinates based on rotation
        let headerX, headerY, rotationAngle;
        
        if (rotation === 180) {
            // Page is rotated 180 degrees - flip coordinates
            headerX = width - ((width - textWidth) / 2);
            headerY = topMargin;
            rotationAngle = 180;
        } else if (rotation === 90) {
            // Page is rotated 90 degrees clockwise
            headerX = topMargin + fontSize;
            headerY = (height + textWidth) / 2;
            rotationAngle = 90;
        } else if (rotation === 270) {
            // Page is rotated 270 degrees (90 counter-clockwise)
            headerX = width - topMargin - fontSize;
            headerY = (height - textWidth) / 2;
            rotationAngle = 270;
        } else {
            // Normal orientation (0 degrees)
            headerX = (width - textWidth) / 2;
            headerY = height - topMargin - fontSize;
            rotationAngle = 0;
        }
        
        // Draw white background rectangle (all rotation angles)
        if (settings.annexureLabelBackground) {
            const padding = 4;

            if (rotation === 0) {
                // Normal: text flows right, ascent goes up
                firstPage.drawRectangle({
                    x: headerX - padding,
                    y: headerY - padding,
                    width: textWidth + (padding * 2),
                    height: fontSize + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 90) {
                // CCW 90°: text advances downward (−y), ascent goes right (+x)
                // Text spans y: [headerY − textWidth, headerY], x: [headerX, headerX + fontSize]
                firstPage.drawRectangle({
                    x: headerX - padding,
                    y: headerY - textWidth - padding,
                    width: fontSize + (padding * 2),
                    height: textWidth + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 270) {
                // 270° (CW 90°): text advances upward (+y), ascent goes left (−x)
                // Text spans y: [headerY, headerY + textWidth], x: [headerX − fontSize, headerX]
                firstPage.drawRectangle({
                    x: headerX - fontSize - padding,
                    y: headerY - padding,
                    width: fontSize + (padding * 2),
                    height: textWidth + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            } else if (rotation === 180) {
                // 180°: text advances left (−x), ascent goes down (−y)
                // Text spans x: [headerX − textWidth, headerX], y: [headerY − fontSize, headerY]
                firstPage.drawRectangle({
                    x: headerX - textWidth - padding,
                    y: headerY - fontSize - padding,
                    width: textWidth + (padding * 2),
                    height: fontSize + (padding * 2),
                    color: rgb(1, 1, 1),
                });
            }
        }
        
        // Draw text
        firstPage.drawText(headerText, {
            x: headerX,
            y: headerY,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0),
            rotate: degrees(rotationAngle),
        });
    };

    // Helper function to convert number to alphabetical format (B, C, D... Z, AA, AB, etc.)
    const numberToAlphabet = (num: number): string => {
        let result = '';
        let n = num;
        while (n > 0) {
            const remainder = (n - 1) % 26;
            result = String.fromCharCode(65 + remainder) + result;
            n = Math.floor((n - 1) / 26);
        }
        return result;
    };

    // Helper function to parse page range string from Index
    const parsePageRange = (rangeStr: string): { start: number, end: number, isAlphabetical: boolean } | null => {
        if (!rangeStr) return null;
        
        // Check if it's alphabetical (contains letters)
        if (/[A-Z]/i.test(rangeStr)) {
            // Handle alphabetical ranges like "B" or "B-D"
            const parts = rangeStr.split('-').map(s => s.trim());
            if (parts.length === 1) {
                // Single page like "B"
                return { start: parts[0].charCodeAt(0) - 65 + 1, end: parts[0].charCodeAt(0) - 65 + 1, isAlphabetical: true };
            } else if (parts.length === 2) {
                // Range like "B-D"
                return { 
                    start: parts[0].charCodeAt(0) - 65 + 1, 
                    end: parts[1].charCodeAt(0) - 65 + 1, 
                    isAlphabetical: true 
                };
            }
        } else {
            // Handle numeric ranges like "1" or "1-5"
            const parts = rangeStr.split('-').map(s => s.trim());
            if (parts.length === 1) {
                // Single page like "1"
                const num = parseInt(parts[0]);
                return { start: num, end: num, isAlphabetical: false };
            } else if (parts.length === 2) {
                // Range like "1-5"
                return { 
                    start: parseInt(parts[0]), 
                    end: parseInt(parts[1]), 
                    isAlphabetical: false 
                };
            }
        }
        
        return null;
    };

    // Helper function to add numeric page numbers to all pages of a PDF
    const addPageNumbers = async (pdf: PDFDocument, startingPageNumber: number): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = 20;
        
        // Position: 0.75 inches from top and right
        const topMargin = 54; // 0.75 inches = 54 points
        const rightMargin = 54; // 0.75 inches = 54 points
        
        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { width, height } = page.getSize();
            const rotation = page.getRotation().angle;
            const pageNumber = startingPageNumber + i;
            const pageText = pageNumber.toString();
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);
            
            // Adjust coordinates based on rotation
            let x, y, rotationAngle;
            
            if (rotation === 180) {
                // Page is rotated 180 degrees
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin + fontSize;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees (90 counter-clockwise)
                x = width - topMargin - fontSize;
                y = height - rightMargin - textWidth;
                rotationAngle = 270;
            } else {
                // Normal orientation (0 degrees)
                x = width - rightMargin - textWidth;
                y = height - topMargin - fontSize;
                rotationAngle = 0;
            }
            
            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Helper function to add alphabetical page numbers to all pages of a PDF
    const addAlphabeticalPageNumbers = async (pdf: PDFDocument, startingLetterIndex: number): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = 20;
        
        // Position: 0.75 inches from top and right
        const topMargin = 54; // 0.75 inches = 54 points
        const rightMargin = 54; // 0.75 inches = 54 points
        
        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { width, height } = page.getSize();
            const rotation = page.getRotation().angle;
            const letterIndex = startingLetterIndex + i;
            const pageText = numberToAlphabet(letterIndex);
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);
            
            // Adjust coordinates based on rotation
            let x, y, rotationAngle;
            
            if (rotation === 180) {
                // Page is rotated 180 degrees
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin + fontSize;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees (90 counter-clockwise)
                x = width - topMargin - fontSize;
                y = height - rightMargin - textWidth;
                rotationAngle = 270;
            } else {
                // Normal orientation (0 degrees)
                x = width - rightMargin - textWidth;
                y = height - topMargin - fontSize;
                rotationAngle = 0;
            }
            
            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Helper function to add A-prefixed page numbers (A1, A2, A3...) for Listing Proforma
    const addAPrefixedPageNumbers = async (pdf: PDFDocument): Promise<number> => {
        const pageCount = pdf.getPageCount();
        if (pageCount === 0) return 0;
        
        // Load Times New Roman Bold font
        const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
        const fontSize = 20;
        
        // Position: 0.75 inches from top and right
        const topMargin = 54; // 0.75 inches = 54 points
        const rightMargin = 54; // 0.75 inches = 54 points
        
        for (let i = 0; i < pageCount; i++) {
            const page = pdf.getPage(i);
            const { width, height } = page.getSize();
            const pageNumber = i + 1; // 1, 2, 3...
            const pageText = `A${pageNumber}`; // A1, A2, A3...
            const textWidth = font.widthOfTextAtSize(pageText, fontSize);
            
            // Check page rotation and adjust coordinates accordingly
            const rotation = page.getRotation().angle;
            let x = width - rightMargin - textWidth;
            let y = height - topMargin - fontSize;
            let rotationAngle = 0;
            
            if (rotation === 180) {
                // Page is upside down - flip coordinates and rotate text
                x = rightMargin;
                y = topMargin;
                rotationAngle = 180;
            } else if (rotation === 90) {
                // Page is rotated 90 degrees clockwise
                x = topMargin;
                y = rightMargin + textWidth;
                rotationAngle = 90;
            } else if (rotation === 270) {
                // Page is rotated 270 degrees clockwise (90 counter-clockwise)
                x = height - topMargin - fontSize;
                y = width - rightMargin;
                rotationAngle = 270;
            }
            
            page.drawText(pageText, {
                x,
                y,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
                rotate: degrees(rotationAngle),
            });
        }
        
        return pageCount; // Return number of pages processed
    };

    // Track page numbering states
    let numericNumberingStarted = false;
    let currentNumericPage = 1;
    let alphabeticalNumberingStarted = false;
    let currentAlphabeticalIndex = 2; // Start at B (A=1, B=2)

    // Track bookmarks for the outline
    interface BookmarkEntry {
        title: string;
        pageIndex: number;
        isPaginated: boolean;
        startPageNum?: number; // Printed page number (for paginated bookmarks)
        endPageNum?: number;   // Printed page number (for paginated bookmarks)
        isAlphabetical?: boolean; // True if page numbers are alphabetical (A, B, C...)
    }
    const bookmarks: BookmarkEntry[] = [];

    // ===== PASS 1: Generate all documents and count pages =====
    console.log('[PDF GEN] Pass 1: Generating all documents and counting pages...');
    
    // Store page counts for each document
    interface DocPageInfo {
        id: string;
        pageCount: number;
        shouldCombineWithNext: boolean; // For SLP+Affidavit, IA+Affidavit, Annexure+Typed
    }
    const docPageCounts: Map<string, DocPageInfo> = new Map();
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        try {
            let docxBuffer: Uint8Array | null = null;
            
            if (!meta.useSystem) {
                // User uploaded file - load it
                const userFile: File | null = formData.get(meta.id) as File | null;
                if (userFile) {
                    const fileBuffer = await userFile.arrayBuffer();
                    if (fileBuffer.byteLength > 0) {
                        // Load PDF directly to count pages
                        const pdf = await PDFDocument.load(fileBuffer);
                        docPageCounts.set(meta.id, {
                            id: meta.id,
                            pageCount: pdf.getPageCount(),
                            shouldCombineWithNext: false
                        });
                        continue;
                    }
                }
            } else {
                // System-generated document
                const iaIdentifier = meta.id.startsWith('ia_') ? meta.id.substring(3) : '';
                let result;
                
                // Skip CI for now - we'll regenerate it in Pass 2 with page ranges
                if (meta.id === 'ci') {
                    result = await generateCiDocx(projectData);
                } else if (meta.id === 'or') {
                    result = await generateOrDocx(projectData);
                } else if (meta.id === 'cior') {
                    // Legacy support - generate CI only
                    result = await generateCiDocx(projectData);
                } else {
                    switch (meta.id) {
                        case 'lp': result = await generateLpDocx(projectData); break;
                        case 'slod': result = await generateSlodDocx(projectData); break;
                        case 'slp': result = await generateSlpDocx(projectData); break;
                        case 'appendix': result = await generateAppendixDocx(projectData); break;
                        case 'filingMemo': result = await generateFilingMemoDocx(projectData); break;
                        case 'advocateChecklist': result = await generateAdvocateChecklistDocx(projectData); break;
                        default:
                            if (iaIdentifier && !meta.id.startsWith('ia_affidavit_')) {
                                result = await generateIaDocx(projectData, iaIdentifier);
                            }
                            break;
                    }
                }
                
                if (result && result.success && result.docx) {
                    docxBuffer = base64ToBuffer(result.docx);
                }
            }
            
            if (docxBuffer) {
                // Convert DOCX to PDF and count pages
                const { pageCount } = await convertDocxToPdf(docxBuffer);
                
                // Determine if this document should be combined with the next one
                let shouldCombine = false;
                if (meta.id === 'slp' || meta.id.startsWith('ia_') && !meta.id.startsWith('ia_affidavit_')) {
                    shouldCombine = true; // SLP and IA will combine with their affidavits
                } else if (meta.id.startsWith('annexure_') && !meta.id.endsWith('_typed')) {
                    // Check if next item is the typed/translated copy
                    const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
                    if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                        const nextMeta = fileMetas[currentIndex + 1];
                        if (nextMeta.id === `${meta.id}_typed`) {
                            shouldCombine = true;
                        }
                    }
                }
                
                docPageCounts.set(meta.id, {
                    id: meta.id,
                    pageCount,
                    shouldCombineWithNext: shouldCombine
                });
            }
        } catch (error) {
            console.warn(`[PDF GEN] Pass 1 - Failed to count pages for ${meta.id}:`, error);
            // Continue with other documents
        }
    }
    
    console.log('[PDF GEN] Pass 1 complete. Document page counts:', Array.from(docPageCounts.entries()));
    
    // ===== Calculate Page Ranges for Index =====
    console.log('[PDF GEN] Calculating page ranges for Index...');
    
    // Map from S.No. (Index row number) to page range string
    const indexPageRanges = new Map<number, string>();
    
    // Map from document ID to its Index S.No. (for bookmark page ranges)
    const docIdToIndexSNo = new Map<string, number>();
    
    // S.No. 1-8 are non-paginated (Court Fees, O/R, LP, Cover, Index, Report, Defect, Note)
    // S.No. 9 is Synopsis (needs B-X format)
    // S.No. 10+ are other documents (need numeric ranges)
    
    let sNo = 9; // Start from Synopsis
    let currentAlphabetIndex = 2; // B
    let currentNumericPageNum = 1;
    let hasSeenImpugnedOrder = false; // Track when we switch to numeric
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const pageInfo = docPageCounts.get(meta.id);
        if (!pageInfo) continue;
        
        // Skip certain items that don't get their own Index entry
        if (meta.id === 'advocateChecklist' || meta.id === 'ci' || meta.id === 'or' || meta.id === 'lp') {
            continue; // These are handled separately in CI generation
        }
        
        // Skip items that are combined with previous (affidavits and typed/translated copies)
        if (meta.id === 'slpAffidavit' || meta.id.startsWith('ia_affidavit_') || meta.id.endsWith('_typed')) {
            continue;
        }
        
        // Store the mapping from document ID to S.No.
        docIdToIndexSNo.set(meta.id, sNo);
        
        let totalPages = pageInfo.pageCount;
        
        // Add next item's pages if should combine
        if (pageInfo.shouldCombineWithNext) {
            const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
            if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                const nextMeta = fileMetas[currentIndex + 1];
                const nextPageInfo = docPageCounts.get(nextMeta.id);
                if (nextPageInfo) {
                    totalPages += nextPageInfo.pageCount;
                }
            }
        }
        
        if (meta.id === 'slod') {
            // Synopsis: B-<last letter>
            const lastLetterIndex = currentAlphabetIndex + totalPages - 1;
            // Handle single page case
            if (totalPages === 1) {
                indexPageRanges.set(sNo, `B`);
            } else {
                indexPageRanges.set(sNo, `B-${numberToAlphabet(lastLetterIndex)}`);
            }
            currentAlphabetIndex = lastLetterIndex + 1;
        } else {
            // Check if we've reached Impugned Order to start numeric numbering
            if (meta.id.startsWith('impugnedOrder_')) {
                hasSeenImpugnedOrder = true;
            }
            
            // All documents after Synopsis use numeric ranges (starting from Impugned Order)
            if (hasSeenImpugnedOrder && totalPages > 0) {
                const endPage = currentNumericPageNum + totalPages - 1;
                // Handle single page case
                if (totalPages === 1) {
                    indexPageRanges.set(sNo, `${currentNumericPageNum}`);
                } else {
                    indexPageRanges.set(sNo, `${currentNumericPageNum}-${endPage}`);
                }
                currentNumericPageNum = endPage + 1;
            }
        }
        
        sNo++;
    }
    
    console.log('[PDF GEN] Index page ranges calculated:', Array.from(indexPageRanges.entries()));
    
    // ===== Calculate Annexure Page Ranges for List of Dates =====
    console.log('[PDF GEN] Calculating annexure page ranges for List of Dates...');
    
    // Map from annexure ID to its page range in the final PDF
    const annexurePageRanges = new Map<string, {start: number, end: number}>();
    
    // Reset to track page numbers for annexures (both P-annexures and A-annexures)
    let annexurePageNum = 1;
    let trackingAnnexures = false;
    
    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const pageInfo = docPageCounts.get(meta.id);
        if (!pageInfo) continue;
        
        // Start tracking page numbers when we hit the first Impugned Order
        if (meta.id.startsWith('impugnedOrder_')) {
            trackingAnnexures = true;
        }
        
        if (trackingAnnexures && (meta.id.startsWith('annexure_') || meta.id.startsWith('ia_annexure_'))) {
            // Extract the base annexure ID (without _typed suffix)
            const annexureId = meta.id.endsWith('_typed') 
                ? meta.id.substring(0, meta.id.length - 6) // Remove '_typed'
                : meta.id;
            
            let baseAnnexureId: string;
            if (annexureId.startsWith('annexure_')) {
                baseAnnexureId = annexureId.substring(9); // Remove 'annexure_' prefix
            } else if (annexureId.startsWith('ia_annexure_')) {
                baseAnnexureId = annexureId.substring(12); // Remove 'ia_annexure_' prefix
            } else {
                baseAnnexureId = annexureId;
            }
            
            // Check if we've already recorded this annexure (for base annexure)
            if (!meta.id.endsWith('_typed')) {
                // This is the main annexure
                let totalPages = pageInfo.pageCount;
                
                // Check if there's a typed/translated copy to combine (only for P-annexures)
                if (meta.id.startsWith('annexure_')) {
                    const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
                    if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                        const nextMeta = fileMetas[currentIndex + 1];
                        if (nextMeta.id === `${meta.id}_typed`) {
                            const typedPageInfo = docPageCounts.get(nextMeta.id);
                            if (typedPageInfo) {
                                totalPages += typedPageInfo.pageCount;
                            }
                        }
                    }
                }
                
                const startPage = annexurePageNum;
                const endPage = annexurePageNum + totalPages - 1;
                
                annexurePageRanges.set(baseAnnexureId, {
                    start: startPage,
                    end: endPage
                });
                
                annexurePageNum = endPage + 1;
            }
            // Skip typed copies as they're already counted above
        } else if (trackingAnnexures && pageInfo.pageCount > 0) {
            // Track pages for non-annexure documents after Impugned Order
            let totalPages = pageInfo.pageCount;
            
            // Add next item's pages if should combine
            if (pageInfo.shouldCombineWithNext) {
                const currentIndex = fileMetas.findIndex(m => m.id === meta.id);
                if (currentIndex >= 0 && currentIndex < fileMetas.length - 1) {
                    const nextMeta = fileMetas[currentIndex + 1];
                    if (!nextMeta.id.startsWith('annexure_')) {
                        const nextPageInfo = docPageCounts.get(nextMeta.id);
                        if (nextPageInfo) {
                            totalPages += nextPageInfo.pageCount;
                        }
                    }
                }
            }
            
            // Skip combined items
            if (!meta.id.endsWith('_typed') && !meta.id.startsWith('ia_affidavit_') && meta.id !== 'slpAffidavit') {
                annexurePageNum += totalPages;
            }
        }
    }
    
    console.log('[PDF GEN] Annexure page ranges calculated:', Array.from(annexurePageRanges.entries()));
    
    // ===== PASS 2: Main document processing with page ranges =====
    console.log('[PDF GEN] Pass 2: Processing documents with calculated page ranges...');

    for (const meta of fileMetas) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        let pdfToMerge: PDFDocument | null = null;
        
        try {
            if (!meta.useSystem) {
                let userFile: File | null = formData.get(meta.id) as File | null;
                if(userFile) {
                    const fileBuffer = await userFile.arrayBuffer();
                    if (fileBuffer.byteLength > 0) {
                        pdfToMerge = await PDFDocument.load(fileBuffer);
                    } else {
                        throw new Error("Uploaded file is empty.");
                    }
                } else {
                    throw new Error("File not found in form data.");
                }
            } else { // meta.useSystem is true
                let result;
                const iaIdentifier = meta.id.startsWith('ia_') ? meta.id.substring(3) : '';
                
                switch (meta.id) {
                    case 'ci': 
                        // Regenerate CI with calculated page ranges
                        result = await generateCiDocx(projectData, indexPageRanges); 
                        break;
                    case 'or':
                        result = await generateOrDocx(projectData);
                        break;
                    case 'cior':
                        // Legacy support - generate CI with page ranges
                        result = await generateCiDocx(projectData, indexPageRanges);
                        break;
                    case 'lp': result = await generateLpDocx(projectData); break;
                    case 'slod': 
                        // Regenerate SLOD with calculated annexure page ranges
                        result = await generateSlodDocx(projectData, annexurePageRanges); 
                        break;
                    case 'slp': result = await generateSlpDocx(projectData); break;
                    case 'appendix': result = await generateAppendixDocx(projectData); break;
                    case 'filingMemo': result = await generateFilingMemoDocx(projectData); break;
                    case 'advocateChecklist': result = await generateAdvocateChecklistDocx(projectData); break;
                    default:
                        if (iaIdentifier && !meta.id.startsWith('ia_affidavit_')) {
                            result = await generateIaDocx(projectData, iaIdentifier, undefined, annexurePageRanges);
                        }
                        break;
                }

                if (result && result.success && result.docx) {
                    // Convert DOCX to PDF via Electron IPC
                    try {
                        const docxBuffer = Uint8Array.from(atob(result.docx), c => c.charCodeAt(0));
                        const { pdf } = await convertDocxToPdf(docxBuffer);
                        pdfToMerge = pdf;
                        console.log(`[PDF GEN] ${meta.id} converted successfully`);
                    } catch (conversionError) {
                        console.error(`[PDF GEN] Error for ${meta.id}:`, conversionError);
                        throw new Error(`PDF conversion failed: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}.`);
                    }
                } else {
                    throw new Error('DOCX generation failed.');
                }
            }

            if (pdfToMerge) {
                // Check if this is the Synopsis to start alphabetical numbering
                if (meta.id === 'slod' && !alphabeticalNumberingStarted) {
                    alphabeticalNumberingStarted = true;
                }
                
                // Check if this is the first Impugned Order to switch to numeric numbering
                if (meta.id.startsWith('impugnedOrder_') && !numericNumberingStarted) {
                    numericNumberingStarted = true;
                    alphabeticalNumberingStarted = false; // Stop alphabetical numbering
                    currentNumericPage = 1;
                }
                
                // Add appropriate page numbers based on current state
                if (meta.id === 'lp') {
                    // Special handling for Listing Proforma: Add A1, A2, A3... page numbers
                    await addAPrefixedPageNumbers(pdfToMerge);
                } else if (numericNumberingStarted) {
                    // Numeric numbering (1, 2, 3...)
                    const pagesAdded = await addPageNumbers(pdfToMerge, currentNumericPage);
                    currentNumericPage += pagesAdded;
                } else if (alphabeticalNumberingStarted) {
                    // Alphabetical numbering (B, C, D...)
                    const pagesAdded = await addAlphabeticalPageNumbers(pdfToMerge, currentAlphabeticalIndex);
                    currentAlphabeticalIndex += pagesAdded;
                }
                // else: No numbering (before Synopsis)
                
                // Check if this is an annexure and add header if needed
                if (meta.id.startsWith('annexure_')) {
                    let headerText = '';
                    
                    // Check if this is a typed or translated copy
                    if (meta.id.endsWith('_typed')) {
                        // Extract the annexure number from the label
                        // Label format: "Annexure P-X: Title (Typed Copy)" or "(Translated Copy)"
                        const match = meta.label.match(/Annexure (P-\d+).*\((Typed|Translated) Copy\)/);
                        if (match) {
                            const annexureNum = match[1]; // e.g., "P-1"
                            const copyType = match[2]; // "Typed" or "Translated"
                            headerText = `${copyType} Copy of Annexure ${annexureNum}`;
                        }
                    } else {
                        // Regular annexure
                        // Label format: "Annexure P-X: Title"
                        const match = meta.label.match(/Annexure (P-\d+)/);
                        if (match) {
                            headerText = `Annexure ${match[1]}`;
                        }
                    }
                    
                    if (headerText) {
                        await addAnnexureHeader(pdfToMerge, headerText);
                    }
                }

                // Check if this is an IA annexure and add header if needed
                if (meta.id.startsWith('ia_annexure_')) {
                    // Label format: "Annexure A-X: Title"
                    const match = meta.label.match(/Annexure (A-\d+)/);
                    if (match) {
                        const headerText = `Annexure ${match[1]}`;
                        await addAnnexureHeader(pdfToMerge, headerText);
                    }
                }

                // Check if this is the certified copy receipt and add header
                if (meta.id === 'certified_copy_receipt') {
                    await addAnnexureHeader(pdfToMerge, 'Annexure-A');
                }
                
                const totalPagesBefore = mergedPdf.getPageCount();
                const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
                
                // Add bookmarks
                if (copiedPages.length > 0) {
                    const bookmarkText = getBookmarkText(meta);
                    
                    // Special handling for CI: Add Cover Page and Index as separate bookmarks
                    if (meta.id === 'ci' && copiedPages.length >= 2) {
                        bookmarks.push({
                            title: 'Cover Page',
                            pageIndex: totalPagesBefore,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Index',
                            pageIndex: totalPagesBefore + 1,
                            isPaginated: false
                        });
                    } else if (meta.id === 'or') {
                        // Office Report always has page A (fixed)
                        bookmarks.push({
                            title: 'Office Report',
                            pageIndex: totalPagesBefore,
                            isPaginated: true,
                            startPageNum: 1, // A = 1
                            endPageNum: 1,   // A = 1 (single page)
                            isAlphabetical: true
                        });
                    } else if (meta.id === 'cior' && copiedPages.length >= 2) {
                        // Legacy CIOR support (combined file)
                        bookmarks.push({
                            title: 'Cover Page',
                            pageIndex: totalPagesBefore,
                            isPaginated: false
                        });
                        bookmarks.push({
                            title: 'Index',
                            pageIndex: totalPagesBefore + 1,
                            isPaginated: false
                        });
                        // Office Report starts on the next page after Index
                        if (copiedPages.length >= 3) {
                            // Office Report always has page A (fixed)
                            bookmarks.push({
                                title: 'Office Report',
                                pageIndex: totalPagesBefore + 2,
                                isPaginated: true,
                                startPageNum: 1, // A = 1
                                endPageNum: 1,   // A = 1 (single page)
                                isAlphabetical: true
                            });
                        }
                    } else if (bookmarkText) {
                        // Look up this document's S.No. in the Index
                        const sNo = docIdToIndexSNo.get(meta.id);
                        
                        // Determine if this bookmark should be paginated
                        const isPaginated = numericNumberingStarted || alphabeticalNumberingStarted;
                        
                        let startPageNum: number | undefined;
                        let endPageNum: number | undefined;
                        let isAlphabetical = false;
                        
                        // Special handling for specific documents
                        if (meta.id === 'lp') {
                            // Listing Proforma: Always [pp.A1-A2]
                            startPageNum = 1; // A1 = 1
                            endPageNum = 2;   // A2 = 2
                            isAlphabetical = true;
                        } else if (meta.id === 'slod') {
                            // Synopsis and List of Dates: Use Index S.No. 9 range (B-X)
                            const synopsisRange = indexPageRanges.get(9);
                            if (synopsisRange) {
                                const parsed = parsePageRange(synopsisRange);
                                if (parsed) {
                                    startPageNum = parsed.start;
                                    endPageNum = parsed.end;
                                    isAlphabetical = parsed.isAlphabetical;
                                }
                            }
                        } else if (isPaginated && sNo !== undefined) {
                            // Use the page range from Index calculation
                            const rangeStr = indexPageRanges.get(sNo);
                            if (rangeStr) {
                                const parsed = parsePageRange(rangeStr);
                                if (parsed) {
                                    startPageNum = parsed.start;
                                    endPageNum = parsed.end;
                                    isAlphabetical = parsed.isAlphabetical;
                                }
                            }
                        }
                        
                        bookmarks.push({
                            title: bookmarkText,
                            pageIndex: totalPagesBefore,
                            isPaginated: isPaginated,
                            startPageNum,
                            endPageNum,
                            isAlphabetical
                        });
                    }
                }
            } else {
                throw new Error("PDF document to merge was null.");
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            failedDocs.push({ label: meta.label, reason });
        }
    }
    
    if (failedDocs.length > 0) {
        const errorList = failedDocs.map(f => `- ${f.label}: ${f.reason}`).join('\n');
        return { 
            success: false, 
            message: `Could not generate the full PDF because the following documents failed:\n${errorList}`
        };
    }
    
    if (mergedPdf.getPageCount() === 0) {
        return { success: false, message: "No PDF files were provided or generated to merge." };
    }

    // Create PDF Outline (Bookmarks)
    if (bookmarks.length > 0) {
        try {
            const context = mergedPdf.context;
            const pages = mergedPdf.getPages();
            
            // Create outline items (bookmarks)
            const outlineItems: PDFRef[] = [];
            
            for (let i = 0; i < bookmarks.length; i++) {
                const bookmark = bookmarks[i];
                const pageRef = pages[bookmark.pageIndex].ref;
                const pageHeight = pages[bookmark.pageIndex].getHeight();
                
                // Generate bookmark title with page numbers for paginated items
                let bookmarkTitle = bookmark.title;
                if (bookmark.isPaginated && bookmark.startPageNum !== undefined && bookmark.endPageNum !== undefined) {
                    // Format page range
                    let pageRangeSuffix: string;
                    
                    if (bookmark.isAlphabetical) {
                        // Convert numbers to letters (1=A, 2=B, 3=C, etc.)
                        const startLetter = numberToAlphabet(bookmark.startPageNum);
                        const endLetter = numberToAlphabet(bookmark.endPageNum);
                        
                        if (bookmark.startPageNum === bookmark.endPageNum) {
                            // Single page
                            pageRangeSuffix = ` [p.${startLetter}]`;
                        } else {
                            // Page range
                            pageRangeSuffix = ` [pp.${startLetter}-${endLetter}]`;
                        }
                    } else {
                        // Numeric page numbers
                        if (bookmark.startPageNum === bookmark.endPageNum) {
                            // Single page
                            pageRangeSuffix = ` [p.${bookmark.startPageNum}]`;
                        } else {
                            // Page range
                            pageRangeSuffix = ` [pp.${bookmark.startPageNum}-${bookmark.endPageNum}]`;
                        }
                    }
                    
                    bookmarkTitle = `${bookmark.title}${pageRangeSuffix}`;
                }
                
                const outlineDict = PDFDict.withContext(context);
                outlineDict.set(PDFName.of('Title'), PDFString.of(bookmarkTitle));
                
                // Create destination array
                const destArray = PDFArray.withContext(context);
                destArray.push(pageRef);
                destArray.push(PDFName.of('XYZ'));
                destArray.push(PDFNumber.of(0));
                destArray.push(PDFNumber.of(pageHeight));
                destArray.push(PDFNumber.of(0));
                
                outlineDict.set(PDFName.of('Dest'), destArray);
                
                const ref = context.register(outlineDict);
                outlineItems.push(ref);
            }
            
            // Set Prev and Next references
            for (let i = 0; i < outlineItems.length; i++) {
                const itemDict = context.lookup(outlineItems[i]) as PDFDict;
                
                if (i > 0) {
                    itemDict.set(PDFName.of('Prev'), outlineItems[i - 1]);
                }
                if (i < outlineItems.length - 1) {
                    itemDict.set(PDFName.of('Next'), outlineItems[i + 1]);
                }
            }
            
            // Create the Outlines dictionary (root of the outline tree)
            const outlinesDict = PDFDict.withContext(context);
            outlinesDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
            outlinesDict.set(PDFName.of('First'), outlineItems[0]);
            outlinesDict.set(PDFName.of('Last'), outlineItems[outlineItems.length - 1]);
            outlinesDict.set(PDFName.of('Count'), PDFNumber.of(bookmarks.length));
            
            const outlinesRef = context.register(outlinesDict);
            
            // Set Parent reference for all outline items
            for (const itemRef of outlineItems) {
                const itemDict = context.lookup(itemRef) as PDFDict;
                itemDict.set(PDFName.of('Parent'), outlinesRef);
            }
            
            // Add Outlines to the catalog
            const catalog = context.lookup(context.trailerInfo.Root) as PDFDict;
            catalog.set(PDFName.of('Outlines'), outlinesRef);
        } catch (bookmarkError) {
            console.warn('[PDF GEN] Failed to create bookmarks:', bookmarkError);
            // Continue without bookmarks rather than failing
        }
    }

    const pdfBytes = await mergedPdf.save();
    // Convert Uint8Array to base64 without Buffer (browser-safe)
    let binary = '';
    for (let i = 0; i < pdfBytes.byteLength; i++) binary += String.fromCharCode(pdfBytes[i]);
    const pdfBase64 = btoa(binary);

    return { success: true, pdf: pdfBase64 };
}

    

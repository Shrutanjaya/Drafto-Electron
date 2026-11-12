
"use client"

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useForm, FormProvider, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { getIaList } from "@/lib/ia-list-utils";
import { isScWpFamily, annexurePrefix } from "@/lib/court-family";
import { getScWpIaList } from "@/lib/sc-wp/sc-wp-actions";
import { wpAnnexureOrderFromLods } from "@/lib/wp/wp-annexures";
import { annexureRowsOf, annexureModeOf, factsRowsOf, factsRowsPath } from "@/lib/wp/facts-mode";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useEntitlement, useExportPermission } from "@/providers/entitlement-provider";
import { generatePdf } from "@/lib/actions";
import { getSettings } from "./settings-dialog";
import { incrementGenerationCount } from "@/lib/firebase/usage-service";
import { Upload, Loader2, Info, Lock, CheckCircle2, AlertCircle, Settings2, AlertTriangle, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { pickFile } from "@/lib/utils/pick-file";
import { annexureDetails } from "@/lib/annexure-details";
import {
    getAppendixItems,
    getActiveAppendixItems,
    appendixHasContent,
    appendixLabel,
    appendixBodyText,
    appendixComponentId,
    isAppendixComponentId,
    appendixItemIdFromComponentId,
} from "@/lib/appendix";
import { format } from "date-fns";


// ─── Pre-generation validation ─────────────────────────────────────────────

type ValidationResult = {
    warnings: string[];
    issues: { tab: string; items: string[] }[];
};

function validateProjectForPdf(data: DraftoProject): ValidationResult {
    const warnings: string[] = [];
    const issues: { tab: string; items: string[] }[] = [];

    // Filing date check
    const today = new Date();
    const fd = data.advocate?.filingDate ? new Date(data.advocate.filingDate) : null;
    if (fd && (
        fd.getFullYear() !== today.getFullYear() ||
        fd.getMonth() !== today.getMonth() ||
        fd.getDate() !== today.getDate()
    )) {
        warnings.push("Filing Date is different from today's date. This might affect the calculation of number of days of delay, if any.");
    }

    // Advocate's Checklist declaration attestation
    if (!data.checklist?.declarationVerified) {
        warnings.push("Advocate's Checklist: the Declaration has not been ticked. Please verify the checklist and tick the declaration before filing.");
    }

    // Basic Info
    const isScWp = isScWpFamily(data.courtType);
    const basicIssues: string[] = [];
    if (!isScWp) {
        (data.impugnedOrders || []).forEach((order, i) => {
            const suffix = (data.impugnedOrders || []).length > 1 ? ` ${i + 1}` : '';
            if (!order.caseNumber?.trim()) basicIssues.push(`Impugned Order${suffix}: Case Number`);
            if (!order.effect?.trim()) basicIssues.push(`Impugned Order${suffix}: HC Action`);
        });
    }
    if (!data.advocate?.aorName?.trim()) basicIssues.push('Advocates: AoR Name');
    if (!data.advocate?.aorCode?.trim()) basicIssues.push('Advocates: AoR Code');
    if (!data.deponent?.name?.trim()) basicIssues.push('Deponent: Name');
    if (!data.deponent?.fatherName?.trim()) basicIssues.push("Deponent: Parent's/Husband's Name");
    if (!data.deponent?.age?.trim()) basicIssues.push('Deponent: Age');
    if (!data.deponent?.address?.trim()) basicIssues.push('Deponent: Address');
    if (basicIssues.length) issues.push({ tab: 'Basic Info', items: basicIssues });

    // Petition (SLP or Writ Petition)
    const slpIssues: string[] = [];
    if (!(data.listOfDates || []).some(r => String(r?.event ?? "").trim())) slpIssues.push('List of Dates table is empty');
    if (!isScWp) {
        if (!(data.questionsOfLaw || []).some(r => String(r?.particulars ?? "").trim())) slpIssues.push('Questions of Law table is empty');
    } else {
        if (!String(data.wp?.facts ?? "").trim()) slpIssues.push('Facts section is empty (click "Generate from List of Dates")');
        if (!(data.wp?.reliefs || []).some(r => String(r?.particulars ?? "").trim())) slpIssues.push('Relief(s) table is empty');
    }
    if (!(data.grounds || []).some(r => String(r?.particulars ?? "").trim())) slpIssues.push('Grounds table is empty');
    if (!String(data.synopsis ?? "").trim()) slpIssues.push('Synopsis is blank');
    // Each Appendix row in the Index is built from its description; without one
    // the row prints a placeholder. Rows with nothing attached are dropped from
    // the paper-book altogether, so say so rather than filing silently short.
    const appendixRows = getAppendixItems(data);
    if (appendixRows.length > 0) {
        const included = appendixRows.filter(appendixHasContent);
        included.forEach((item, index) => {
            if (!String(item.description ?? "").trim() && !String(item.indexTextOverride ?? "").trim()) {
                slpIssues.push(`${appendixLabel(index, included.length)}: description (shown in the Index)`);
            }
        });
        if (appendixRows.length > included.length) {
            slpIssues.push('Appendix: one or more documents have nothing attached and will be left out');
        }
    }
    if (slpIssues.length) issues.push({ tab: isScWp ? 'Petition' : 'SLP', items: slpIssues });

    // IAs
    const iaIssues: string[] = [];
    if (!isScWp && data.standardIas?.condonationOfDelay?.active) {
        if (!(data.standardIas.condonationOfDelay.grounds || []).some(g => String(g?.particulars ?? "").trim()))
            iaIssues.push('Condonation of Delay: Grounds table is empty');
    }
    if (!isScWp && data.standardIas?.condonationOfDelayInRefiling?.active) {
        if (!(data.standardIas.condonationOfDelayInRefiling.grounds || []).some(g => String(g?.particulars ?? "").trim()))
            iaIssues.push('Condonation of Delay in Refiling: Grounds table is empty');
    }
    if (data.standardIas?.exemptionFromSurrendering?.active) {
        if (!(data.standardIas.exemptionFromSurrendering.grounds || []).some(g => String(g?.particulars ?? "").trim()))
            iaIssues.push('Exemption from Surrendering: Grounds table is empty');
    }
    (data.customIas || []).forEach(ia => {
        if (!(ia.grounds || []).some(g => String(g?.particulars ?? "").trim()))
            iaIssues.push(`${String(ia.title ?? "").trim() || 'Custom IA'}: Grounds table is empty`);
    });
    if (iaIssues.length) issues.push({ tab: 'IAs', items: iaIssues });

    // Listing Proforma
    const lpIssues: string[] = [];
    const g = data.listingProforma?.general;
    const sc = data.listingProforma?.specialCategories;
    const lpChecks: [string, string | undefined][] = [
        ['Petitioner Phone', g?.petitionerPhone],
        ['Petitioner Email', g?.petitionerEmail],
        ['Respondent Phone', g?.respondentPhone],
        ['Respondent Email', g?.respondentEmail],
        ['Main Category', g?.mainCategory],
        ['Sub-Category', g?.subCategory],
        ['Not to List Before', g?.notToListBefore],
        ['Judges who passed Impugned Order', g?.judgesPassedImpugned],
        ['Similar disposed of matter (6a)', g?.similarDisposed],
        ['Similar pending matter (6b)', g?.similarPending],
        ['Litigation on same point (12)', g?.litigationOnSamePoint],
        ['FIR No. and Date', sc?.firNoAndDate],
        ['Police Station', sc?.policeStation],
        ['Sentence Awarded', sc?.sentenceAwarded],
        ['Sentence Undergone', sc?.sentenceUndergone],
        ['Particulars of FIR and Case', sc?.firAndCaseParticulars],
        ['Bail Application History', sc?.bailApplicationHistory],
        ['Tax Effect', sc?.taxEffect],
        ['Vehicle No.', sc?.vehicleNo],
        ['Land Acquisition S.4', sc?.landAcqS4],
        ['Land Acquisition S.6', sc?.landAcqS6],
        ['Land Acquisition S.17', sc?.landAcqS17],
    ];
    for (const [label, value] of lpChecks) {
        if (value !== undefined && !String(value ?? "").trim()) lpIssues.push(label);
    }
    if (lpIssues.length) issues.push({ tab: 'Listing Proforma', items: lpIssues });

    return { warnings, issues };
}

// ─────────────────────────────────────────────────────────────────────────────

interface MergeItem {
    id: string;
    label: string;
    useSystem: boolean;
    userFile: File | null;
}

const pdfMergeSchema = z.object({
  mergeItems: z.array(z.object({
    id: z.string(),
    label: z.string(),
    useSystem: z.boolean(),
    userFile: z.any().nullable(),
  })),
});

type PdfMergeForm = z.infer<typeof pdfMergeSchema>;

const USER_UPLOAD_REQUIRED_IDS = [
    'slpAffidavit',
    'memoOfParties',
    'vakalatnama',
    'impugnedOrder_',
    'ia_affidavit_',
    'annexure_',
    'ia_annexure_',
    'appendix',
    'certified_copy_receipt',
];

// User-upload components that are NOT mandatory: missing ones don't block
// generation, they only raise a non-blocking warning (like Custody Certificate
// and FIR Details). Only the SLP Affidavit remains mandatory among affidavits.
const OPTIONAL_UPLOAD_PREFIXES = ['ia_affidavit_'];
const isOptionalUpload = (id: string) => OPTIONAL_UPLOAD_PREFIXES.some(p => id.startsWith(p));

// These two are always regenerated in Pass 2 with injected page numbers / annexure refs.
// A user-supplied file would lack that data, so they must remain locked.
const LOCKED_SYSTEM_IDS = new Set(['ci', 'slod']);
const isLockedId = (id: string) =>
    LOCKED_SYSTEM_IDS.has(id) ||
    (id.startsWith('ia_') && !id.startsWith('ia_affidavit_') && !id.startsWith('ia_annexure_'));


const capitalize = (s: string) => {
    if (!s) return s;
    const trimmed = /^the\s+/i.test(s) ? s.replace(/^the\s+/i, '') : s;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};
const annexDate = (date: string) => date ? ` dated ${date}` : '';

const cleanAnnexureTitle = (title?: string): string => {
    if (!title) return "[Description]";
    const trimmed = title.trim();
    if (!trimmed) return "[Description]";
    return capitalize(trimmed);
};

const getCompactIaTitle = (iaId: string, fullTitle?: string): string => {
    switch (iaId) {
        case "exemptionCertifiedCopy":
            return "IA: Exemption (Certified Copy)";
        case "exemptionOfficialTranslation":
            return "IA: Exemption (Official Translation)";
        case "additionalDocuments":
            return "IA: Additional Documents";
        case "condonationOfDelay":
            return "IA: Condonation of Delay";
        case "condonationOfDelayInRefiling":
            return "IA: Condonation of Delay (Refiling)";
        case "exemptionFromSurrendering":
            return "IA: Exemption (Surrender)";
        case "suspensionOfSentence":
            return "IA: Suspension of Sentence";
        default: {
            if (fullTitle) {
                const clean = fullTitle.replace(/^Application\s+for\s+/i, "").replace(/^Application\s+/i, "");
                return `IA: ${clean}`;
            }
            return `IA: ${iaId}`;
        }
    }
};

const ActionPill = ({
    label,
    isUploaded,
    isOptional,
    fileName,
    onClick,
    onRemove,
    disabled,
}: {
    label: string;
    isUploaded: boolean;
    isOptional?: boolean;
    fileName?: string;
    onClick?: () => void;
    onRemove?: () => void;
    disabled?: boolean;
}) => (
    <div className="inline-flex items-center gap-0.5">
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={onClick}
                        className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border leading-tight select-none",
                            disabled ? "cursor-default opacity-90" : "cursor-pointer",
                            isUploaded
                                ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                                : isOptional
                                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20"
                                : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                        )}
                    >
                        {isUploaded ? (
                            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                        ) : (
                            <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                        )}
                        <span>{label}</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px] text-xs">
                    {disabled
                        ? "System-generated document"
                        : isUploaded
                        ? `File uploaded: ${fileName || "Attached"}. Click to replace.`
                        : isOptional
                        ? `Upload ${label} (Optional)`
                        : `Upload ${label} (Required)`}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
        {isUploaded && isOptional && onRemove && (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                title="Remove upload"
                className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
            >
                <X className="h-2.5 w-2.5" />
            </button>
        )}
    </div>
);

function PdfGenerationDialogContent({ onClose, onGeneratingChange }: { onClose: () => void; onGeneratingChange?: (v: boolean) => void }) {
    const mainForm = useFormContext<DraftoProject>();
    const { toast } = useToast();
    const { openManageSubscription } = useEntitlement();
    // Subscription in good standing AND the Supreme Court on the plan.
    const exportPermission = useExportPermission("SLP");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
    const confirmedIncompleteRef = useRef(false);
    const [showCriminalDocWarning, setShowCriminalDocWarning] = useState(false);
    const confirmedOptionalRef = useRef(false);
    const pendingSubmitData = useRef<PdfMergeForm | null>(null);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState<string>("");
    const [showFilter, setShowFilter] = useState<'pending' | 'all'>('pending');
    const [leftWrap, setLeftWrap] = useState<boolean>(true);
    const [rightWrap, setRightWrap] = useState<boolean>(true);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ annexures: true });
    const cancelledRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isProcessingOcr, setIsProcessingOcr] = useState(false);
    const [enableOcr, setEnableOcr] = useState(false);
    // Refiling: the paper-book is going back to the registry after defects were
    // cured, so it opens with a declaration to that effect.
    const [isRefiling, setIsRefiling] = useState(false);
    const isMac = window.electron?.platform === 'darwin';
    const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const mainFormValues = useWatch({ control: mainForm.control });
    
    const componentList = useMemo(() => {
        const projectData = mainFormValues;
        const list: Omit<MergeItem, 'userFile' | 'useSystem'>[] = [];

        const isScWp = isScWpFamily(projectData.courtType);
        if (isRefiling) list.push({ id: 'refiling', label: 'Refiling Declaration' });
        list.push({ id: 'advocateChecklist', label: "Advocate's Checklist" });
        list.push({ id: 'ci', label: "Cover Page and Index" });
        if (!isScWp) list.push({ id: 'or', label: "Office Report" });
        list.push({ id: 'lp', label: "Listing Proforma" });
        list.push({ id: 'slod', label: "Synopsis and List of Dates" });

        if (!isScWp) {
            (projectData.impugnedOrders || []).forEach((order, index) => {
                list.push({ id: `impugnedOrder_${order.id}`, label: `Impugned Order ${index + 1}` });
            });
        }

        list.push({ id: 'slp', label: isScWp ? "Writ Petition" : "SLP with Certificate" });
        list.push({ id: 'slpAffidavit', label: isScWp ? "Writ Petition Affidavit (Executed)" : "SLP Affidavit (Executed)" });

        // One merge component per attached Appendix document, in the same order
        // (and with the same labels) as the Index rows.
        const appendixItems = getActiveAppendixItems(projectData as DraftoProject);
        appendixItems.forEach((item, index) => {
            list.push({
                id: appendixComponentId(item),
                label: `${appendixLabel(index, appendixItems.length)}: ${appendixBodyText(item)}`,
            });
        });
        
        const activeLodRows = annexureRowsOf(projectData as DraftoProject);
        const allAnnexures: (Annexure & {lodId: string})[] = activeLodRows.flatMap(lod => (lod.annexures || []).map(a => ({...a, lodId: lod.id})));
        
        const annexureNumberingMap = new Map<string, number>();
        let pCounter = 1;
        const nonAdAnnexures = allAnnexures.filter(a => !a.isAdditionalDocument);
        const adAnnexures = allAnnexures.filter(a => a.isAdditionalDocument);

        if (isScWp) {
            const scWpOrder = wpAnnexureOrderFromLods(activeLodRows);
            scWpOrder.forEach(e => annexureNumberingMap.set(e.annex.id, e.pNumber));
        } else {
            nonAdAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));
            adAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));
        }

        // Collect IA ground annexures
        const allIaAnnexures: any[] = [];
        if (!isScWp && projectData.standardIas?.condonationOfDelay?.active) {
            projectData.standardIas.condonationOfDelay.grounds?.forEach(ground => {
                if (ground.annexures) {
                    ground.annexures.forEach(annex => {
                        allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelay' });
                    });
                }
            });
        }
        if (!isScWp && projectData.standardIas?.condonationOfDelayInRefiling?.active) {
            projectData.standardIas.condonationOfDelayInRefiling.grounds?.forEach(ground => {
                if (ground.annexures) {
                    ground.annexures.forEach(annex => {
                        allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelayInRefiling' });
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
        
        const settings = getSettings();
        const translatedFirst = isScWp ? (settings.scWpTranslatedCopyFirst ?? settings.slpTranslatedCopyFirst) : settings.slpTranslatedCopyFirst;
        const processAnnexures = (annexures: (Annexure & {lodId: string})[]) => {
            annexures.forEach(a => {
                const pNum = annexureNumberingMap.get(a.id);
                // Described as the Index describes it — copy type, what it is,
                // its date and the user's own words — so the row being checked
                // says as much as the Index being checked against.
                const details = annexureDetails(a);
                const trueCopy = { id: `annexure_${a.id}`, label: `Annexure ${annexurePrefix(projectData.courtType)}-${pNum}: ${details}` };

                if (a.copyType === "true and typed copy" || a.copyType === "true and translated copy") {
                    const typeLabel = a.copyType.includes('typed') ? 'Typed' : 'Translated';
                    const otherCopy = { id: `annexure_${a.id}_typed`, label: `Annexure ${annexurePrefix(projectData.courtType)}-${pNum}: ${details} (${typeLabel} Copy)` };
                    list.push(...(translatedFirst ? [otherCopy, trueCopy] : [trueCopy, otherCopy]));
                } else {
                    list.push(trueCopy);
                }
            });
        };

        if (isScWp) {
            const scWpOrderedAnnexures = wpAnnexureOrderFromLods(activeLodRows).map(e => ({
                ...e.annex,
                lodId: '',
            }));
            processAnnexures(scWpOrderedAnnexures);
        } else {
            processAnnexures(nonAdAnnexures);
        }
        
        const ias = isScWp
            ? getScWpIaList(projectData as DraftoProject)
            : getIaList(projectData as DraftoProject);
        
        ias.forEach(ia => {
             list.push({id: `ia_${ia.id}`, label: ia.title});
             list.push({id: `ia_affidavit_${ia.id}`, label: `Affidavit for ${ia.title}`});

             // For exemptionCertifiedCopy, add the receipt file entry when user has applied
             if (ia.id === 'exemptionCertifiedCopy' && projectData.standardIas?.exemptionCertifiedCopy?.hasApplied === 'yes') {
                 list.push({ id: 'certified_copy_receipt', label: 'Certified Copy Receipt (Annexure-A)' });
             }
             
             // Add IA ground annexures for this specific IA
             const iaSpecificAnnexures = allIaAnnexures.filter(a => a.iaId === ia.id);
             iaSpecificAnnexures.forEach(a => {
                 const aNum = iaAnnexureNumberingMap.get(a.id);
                 list.push({ id: `ia_annexure_${a.id}`, label: `Annexure A-${aNum}: ${annexureDetails(a)}` });
             });
             
             if (!isScWp && ia.id === 'additionalDocuments') {
                 processAnnexures(adAnnexures);
             }
        });

        // Custody Certificate, FIR Details and Proof of Service are required for
        // Criminal SLPs (optional to attach; not required in Writ Petitions)
        if (!isScWp && projectData.caseType === 'Criminal') {
            list.push({ id: 'custodyCertificate', label: 'Custody Certificate' });
            list.push({ id: 'firDetails', label: 'FIR Details' });
            list.push({ id: 'proofOfService', label: 'Proof of Service' });
        }

        if (!isScWp) list.push({ id: 'memoOfParties', label: 'Memo of Parties' });
        list.push({ id: 'filingMemo', label: 'Filing Memo' });
        list.push({ id: 'vakalatnama', label: 'Vakalatnama(s)' });

        return list;
    }, [mainFormValues, isRefiling]);

    const uploadForm = useForm<PdfMergeForm>({
        resolver: zodResolver(pdfMergeSchema),
        defaultValues: {
            mergeItems: [],
        }
    });

    const { control, setValue, handleSubmit, watch: watchUploadForm, reset: resetUploadForm, getValues } = uploadForm;
    
    useEffect(() => {
        // Check if there's saved state in the main form
        const savedPdfMergeItems = mainForm.getValues('pdfMergeItems');
        
        // Always build the component list based on current project data
        const initialMergeItems = componentList.map(c => {
            const isUserUpload = USER_UPLOAD_REQUIRED_IDS.some(id => c.id.startsWith(id));
            
            // For annexures, ALWAYS use the current file from LoD table (don't use saved state)
            // This ensures annexures stay in sync with the LoD table
            if (c.id.startsWith('annexure_')) {
                // Extract annexure ID - handle IDs that contain underscores
                const withoutPrefix = c.id.substring('annexure_'.length);
                const isTyped = withoutPrefix.endsWith('_typed');
                const annexureId = isTyped ? withoutPrefix.substring(0, withoutPrefix.length - '_typed'.length) : withoutPrefix;
                
                const allAnnexures = annexureRowsOf(mainForm.getValues()).flatMap(l => l.annexures || []);
                const annex = allAnnexures.find(a => a.id === annexureId);
                
                let prePopulatedFile: File | null = null;
                if (annex) {
                    const fileToCheck = isTyped ? annex.typedOrTranslatedFile : annex.file;
                    if (fileToCheck instanceof File) {
                        prePopulatedFile = fileToCheck;
                    }
                }
                
                return {
                    ...c,
                    useSystem: false,
                    userFile: prePopulatedFile,
                };
            }

            // For IA annexures, ALWAYS use the current file from IA grounds (don't use saved state)
            if (c.id.startsWith('ia_annexure_')) {
                const annexureId = c.id.substring('ia_annexure_'.length);
                let prePopulatedFile: File | null = null;
                
                // Check condonation of delay grounds
                const condonationGrounds = mainForm.getValues('standardIas.condonationOfDelay.grounds') || [];
                for (const ground of condonationGrounds) {
                    const annex = ground.annexures?.find((a: any) => a.id === annexureId);
                    if (annex && annex.file instanceof File) {
                        prePopulatedFile = annex.file;
                        break;
                    }
                }

                // Check condonation of delay in refiling grounds
                if (!prePopulatedFile) {
                    const refilingGrounds = mainForm.getValues('standardIas.condonationOfDelayInRefiling.grounds') || [];
                    for (const ground of refilingGrounds) {
                        const annex = ground.annexures?.find((a: any) => a.id === annexureId);
                        if (annex && annex.file instanceof File) {
                            prePopulatedFile = annex.file;
                            break;
                        }
                    }
                }
                
                // Check exemption from surrendering grounds
                if (!prePopulatedFile) {
                    const surrenderingGrounds = mainForm.getValues('standardIas.exemptionFromSurrendering.grounds') || [];
                    for (const ground of surrenderingGrounds) {
                        const annex = ground.annexures?.find((a: any) => a.id === annexureId);
                        if (annex && annex.file instanceof File) {
                            prePopulatedFile = annex.file;
                            break;
                        }
                    }
                }
                
                // Check custom IAs grounds
                if (!prePopulatedFile) {
                    const customIas = mainForm.getValues('customIas') || [];
                    for (const customIa of customIas) {
                        for (const ground of customIa.grounds || []) {
                            const annex = ground.annexures?.find((a: any) => a.id === annexureId);
                            if (annex && annex.file instanceof File) {
                                prePopulatedFile = annex.file;
                                break;
                            }
                        }
                        if (prePopulatedFile) break;
                    }
                }
                
                return {
                    ...c,
                    useSystem: false,
                    userFile: prePopulatedFile,
                };
            }
            
            // Optional Criminal SLP docs — user-upload, but not mandatory
            if (c.id === 'custodyCertificate' || c.id === 'firDetails' || c.id === 'proofOfService') {
                const savedItem = savedPdfMergeItems?.find((s: any) => s.id === c.id);
                return {
                    ...c,
                    useSystem: false,
                    userFile: savedItem?.userFile instanceof File ? savedItem.userFile : null,
                };
            }

            // For certified copy receipt, always use current file from main form
            if (c.id === 'certified_copy_receipt') {
                const receiptFile = mainForm.getValues('standardIas.exemptionCertifiedCopy.receiptFile');
                return {
                    ...c,
                    useSystem: false,
                    userFile: receiptFile instanceof File ? receiptFile : null,
                };
            }

            // For each Appendix document, always use the current file from the
            // Appendix section of the main form.
            if (isAppendixComponentId(c.id)) {
                const itemId = appendixItemIdFromComponentId(c.id);
                const item = getAppendixItems(mainForm.getValues()).find(i => i.id === itemId);
                const useManual = !!item?.useManual;
                return {
                    ...c,
                    // Typed out: let the system generate it from the text.
                    // Uploaded: the user provides the file.
                    useSystem: useManual,
                    userFile: !useManual && item?.file instanceof File ? item.file : null,
                };
            }
            
            // For user upload items (Impugned Order, Vakalatnama, etc.), try saved state first
            let savedItem = null;
            if (savedPdfMergeItems && savedPdfMergeItems.length > 0) {
                savedItem = savedPdfMergeItems.find((saved: any) => saved.id === c.id);
            }
            
            // If we have saved state for this item, use it
            if (savedItem && savedItem.userFile instanceof File) {
                return {
                    ...c,
                    useSystem: savedItem.useSystem,
                    userFile: savedItem.userFile,
                };
            }
            
            return {
                ...c,
                useSystem: !isUserUpload,
                userFile: null,
            };
        });
        
        resetUploadForm({ mergeItems: initialMergeItems });
    }, [componentList, resetUploadForm, mainForm]);

    // Cancel on unmount: fires for every close path (X, Escape, backdrop, Back)
    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            abortControllerRef.current?.abort();
            window.electron?.cancelOcr?.();
        };
    }, []);

    // Notify parent of generating state; block Electron window close while generating
    useEffect(() => {
        onGeneratingChange?.(isGenerating);
        if (!isGenerating) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isGenerating, onGeneratingChange]);

    // Progress timer: 0% to 90% over 60 seconds
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isGenerating) {
            setProgress(0);
            const startTime = Date.now();
            interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const seconds = elapsed / 1000;
                // 90% over 60 seconds = 1.5% per second
                const calculatedProgress = Math.min(90, Math.floor(seconds * 1.5));
                setProgress(calculatedProgress);
            }, 100); // Update every 100ms for smooth progression
        } else {
            setProgress(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isGenerating]);

    const watchedItems = watchUploadForm('mergeItems');

    const handleBack = () => {
        if (isGenerating) {
            setShowCloseConfirm(true);
            return;
        }
        // Save current state to main form before closing
        const currentState = getValues('mergeItems');
        mainForm.setValue('pdfMergeItems', currentState, { shouldDirty: false });
        onClose();
    };

    const confirmClose = () => {
        setShowCloseConfirm(false);
        // cancelledRef + OCR kill are handled by the unmount cleanup effect
        const currentState = getValues('mergeItems');
        mainForm.setValue('pdfMergeItems', currentState, { shouldDirty: false });
        onClose();
    };

    // Syncs an uploaded file back to the specific main-form field it logically belongs to,
    // so the relevant tab reflects the upload in real time.
    const syncFileToMainForm = (itemId: string, file: File) => {
        if (itemId.startsWith('annexure_')) {
            const withoutPrefix = itemId.substring('annexure_'.length);
            const isTyped = withoutPrefix.endsWith('_typed');
            const annexureId = isTyped
                ? withoutPrefix.substring(0, withoutPrefix.length - '_typed'.length)
                : withoutPrefix;
            const currentVals = mainForm.getValues();
            const targetPath = (annexureModeOf(currentVals) === 'facts' && factsRowsOf(currentVals).length > 0)
                ? factsRowsPath(currentVals.courtType)
                : 'listOfDates';
            const lods = (mainForm.getValues(targetPath as any) || []) as any[];
            mainForm.setValue(
                targetPath as any,
                lods.map((lod: any) => ({
                    ...lod,
                    annexures: (lod.annexures || []).map((annex: any) =>
                        annex.id === annexureId
                            ? isTyped ? { ...annex, typedOrTranslatedFile: file } : { ...annex, file }
                            : annex
                    ),
                })),
                { shouldDirty: true }
            );
        } else if (itemId.startsWith('ia_annexure_')) {
            const annexureId = itemId.substring('ia_annexure_'.length);
            const updateGrounds = (grounds: any[]) =>
                (grounds || []).map((g: any) => ({
                    ...g,
                    annexures: (g.annexures || []).map((a: any) =>
                        a.id === annexureId ? { ...a, file } : a
                    ),
                }));
            mainForm.setValue(
                'standardIas.condonationOfDelay.grounds',
                updateGrounds(mainForm.getValues('standardIas.condonationOfDelay.grounds')),
                { shouldDirty: true }
            );
            mainForm.setValue(
                'standardIas.condonationOfDelayInRefiling.grounds',
                updateGrounds(mainForm.getValues('standardIas.condonationOfDelayInRefiling.grounds')),
                { shouldDirty: true }
            );
            mainForm.setValue(
                'standardIas.exemptionFromSurrendering.grounds',
                updateGrounds(mainForm.getValues('standardIas.exemptionFromSurrendering.grounds')),
                { shouldDirty: true }
            );
            mainForm.setValue(
                'customIas',
                (mainForm.getValues('customIas') || []).map((ia: any) => ({
                    ...ia,
                    grounds: updateGrounds(ia.grounds),
                })),
                { shouldDirty: true }
            );
        } else if (isAppendixComponentId(itemId)) {
            const appendixItemId = appendixItemIdFromComponentId(itemId);
            const rows = getAppendixItems(mainForm.getValues());
            mainForm.setValue(
                'appendixItems',
                rows.map(row => (row.id === appendixItemId ? { ...row, file, useManual: false } : row)) as any,
                { shouldDirty: true }
            );
        } else if (itemId === 'certified_copy_receipt') {
            mainForm.setValue('standardIas.exemptionCertifiedCopy.receiptFile', file, { shouldDirty: true });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && activeUploadIndex !== null) {
            const file = e.target.files[0];
            setValue(`mergeItems.${activeUploadIndex}.userFile`, file, { shouldDirty: true });
            if (watchedItems[activeUploadIndex].useSystem) {
                setValue(`mergeItems.${activeUploadIndex}.useSystem`, false);
            }
            syncFileToMainForm(watchedItems[activeUploadIndex].id, file);
            setActiveUploadIndex(null);
            // Reset the file input so the same file can be selected again
            e.target.value = '';
            
            // Sync state to main form immediately after file upload
            setTimeout(() => {
                const currentState = getValues('mergeItems');
                mainForm.setValue('pdfMergeItems', currentState, { shouldDirty: false });
            }, 0);
        }
    };
    
    const triggerFileUpload = async (index: number) => {
        if (typeof window !== 'undefined' && window.electron?.openFileDialog) {
            const file = await pickFile();
            if (file) {
                setValue(`mergeItems.${index}.userFile`, file, { shouldDirty: true });
                if (watchedItems[index].useSystem) {
                    setValue(`mergeItems.${index}.useSystem`, false);
                }
                syncFileToMainForm(watchedItems[index].id, file);
                setTimeout(() => {
                    const currentState = getValues('mergeItems');
                    mainForm.setValue('pdfMergeItems', currentState, { shouldDirty: false });
                }, 0);
            }
        } else {
            // Fallback to browser file input
            setActiveUploadIndex(index);
            fileInputRef.current?.click();
        }
    }

    // Clear an optional document's uploaded file. Optional uploads (IA affidavits,
    // Custody Certificate, FIR Details) live only in the upload form, so clearing
    // the field and persisting the merge state is all that's needed.
    const handleRemoveFile = (index: number) => {
        setValue(`mergeItems.${index}.userFile`, null, { shouldDirty: true });
        setTimeout(() => {
            const currentState = getValues('mergeItems');
            mainForm.setValue('pdfMergeItems', currentState, { shouldDirty: false });
        }, 0);
    }

    const getMissingOptionalDocs = (data: PdfMergeForm): string[] => {
        const isCriminal = mainForm.getValues('caseType') === 'Criminal';
        const isScWp = mainForm.getValues('courtType') === 'WritPetitionSC';
        return data.mergeItems
            .filter(item => {
                // IA Affidavits are optional in all SLPs.
                if (isOptionalUpload(item.id)) return true;
                // Custody Certificate / FIR Details are optional in Criminal SLPs (not WP).
                return !isScWp && isCriminal && ['custodyCertificate', 'firDetails', 'proofOfService'].includes(item.id);
            })
            .filter(item => !(item.userFile instanceof File))
            .map(item => item.label);
    };

    const onSubmit = async (data: PdfMergeForm) => {
        // Entitlement gate: paper-book generation requires an active subscription.
        if (!exportPermission.allowed) {
            toast({
                variant: "destructive",
                title: exportPermission.reason === "court" ? "Not on your plan" : "Subscription required",
                description:
                    exportPermission.reason === "court"
                        ? "The Supreme Court of India is not included in your plan, so this paper-book cannot be generated."
                        : "Paper-book generation is disabled because your subscription isn’t active. Renew to continue.",
                action: (
                    <ToastAction altText="Renew" onClick={openManageSubscription}>
                        Renew
                    </ToastAction>
                ),
            });
            return;
        }

        // Warn if mandatory documents are missing, allowing placeholder generation on confirmation
        const currentMissingMandatory = getMissingUploads();
        if (currentMissingMandatory.length > 0 && !confirmedIncompleteRef.current) {
            pendingSubmitData.current = data;
            setShowIncompleteWarning(true);
            return;
        }
        confirmedIncompleteRef.current = false;

        // Warn if optional docs (IA affidavits, custody/FIR) are missing, but allow proceeding
        const missingOptional = getMissingOptionalDocs(data);
        if (missingOptional.length > 0 && !confirmedOptionalRef.current) {
            pendingSubmitData.current = data;
            setShowCriminalDocWarning(true);
            return;
        }
        confirmedOptionalRef.current = false;
        pendingSubmitData.current = null;

        setIsGenerating(true);
        setProgressLabel("Starting…");
        const formData = new FormData();
        const fileMetas: {id: string, label: string, useSystem: boolean, fileName?: string}[] = [];
        const projectData = mainForm.getValues();

        // Append files from merge items (includes pre-populated annexures and user uploads)
        data.mergeItems.forEach(item => {
            const fileMeta: {id: string, label: string, useSystem: boolean, fileName?: string} = {
                id: item.id,
                label: item.label,
                useSystem: item.useSystem,
            };
            if (item.userFile instanceof File) {
                formData.append(item.id, item.userFile, item.userFile.name);
                fileMeta.fileName = item.userFile.name;
            }
            fileMetas.push(fileMeta);
        });
        
        formData.append('fileMetas', JSON.stringify(fileMetas));
        formData.append('projectData', JSON.stringify(projectData));
        formData.append('settings', JSON.stringify(getSettings()));
        formData.append('enableOcr', String(enableOcr));
        
        cancelledRef.current = false;
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;
        
        try {
            const result = await generatePdf(formData, signal, (label) => setProgressLabel(label));

            // Abort if user cancelled while generation was running
            if (cancelledRef.current) return;

            // ── Multi-volume result (separate PDFs) ────────────────────────────
            if (result.success && result.volumes && result.volumes.length > 0) {
                setProgress(100);
                const _firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(' ');
                const _pet = projectData.petitioners?.[0]?.name?.trim();
                const _res = projectData.respondents?.[0]?.name?.trim();
                const _petPart = _pet ? _firstWords(_pet, 3) : '';
                const _resPart = _res ? _firstWords(_res, 3) : '';
                const caseName = _petPart && _resPart ? `${_petPart} v. ${_resPart}` : _petPart || _resPart || 'Untitled';
                const settings = getSettings();

                for (const vol of result.volumes) {
                    const fileName = `${caseName} Paperbook – ${vol.label}.pdf`;
                    let saved = false;
                    try {
                        if (window.electron?.savePdf) {
                            const savedPath = await window.electron.savePdf({
                                fileName,
                                content: vol.pdf,
                                defaultPath: settings.defaultPdfPath || undefined,
                            });
                            if (savedPath) {
                                saved = true;
                                toast({ title: `${vol.label} Saved`, description: savedPath });
                                window.electron.revealFilePath?.(savedPath);
                            }
                        }
                    } catch { /* fall through to download */ }

                    if (!saved) {
                        const bytes = Uint8Array.from(atob(vol.pdf), c => c.charCodeAt(0));
                        saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
                    }
                }
                incrementGenerationCount('paperbook');
                toast({ title: 'PDF Generated', description: `${result.volumes.length} volumes saved.` });
                onClose();
                return;
            }

            if (result.success && result.pdf) {
                setProgress(100);

                // Offer the quick briefing note (List of Dates + page numbers)
                // once the paper-book is saved/downloaded.
                const offerBriefingNote = () => window.dispatchEvent(new CustomEvent("drafto-offer-briefing", { detail: { pageByAnnexId: (result as { annexureFirstPages?: Record<string, number> }).annexureFirstPages || {} } }));

                // If OCR is enabled, process it
                if (enableOcr && window.electron) {
                    setIsGenerating(false);
                    setIsProcessingOcr(true);
                    try {
                        const ocrResult = await window.electron.processOcr(result.pdf);
                        // Abort if user cancelled during OCR
                        if (cancelledRef.current) return;
                        if (!ocrResult.success) {
                            if (ocrResult.error === 'cancelled') return;
                            throw new Error(ocrResult.error || 'OCR processing failed');
                        }
                        // Use OCR-processed PDF
                        result.pdf = ocrResult.pdf;
                    } catch (ocrError) {
                        if (cancelledRef.current) return;
                        console.error('OCR processing failed:', ocrError);
                        const ocrMsg = ocrError instanceof Error ? ocrError.message : 'OCR processing failed. Saving original PDF.';
                        toast({ 
                            title: "OCR Failed", 
                            description: ocrMsg,
                            variant: "destructive"
                        });
                    } finally {
                        setIsProcessingOcr(false);
                    }
                }

                // Final abort check before saving
                if (cancelledRef.current) return;

                // Generate filename based on case parties
                const _firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(' ');
                const _pet = projectData.petitioners?.[0]?.name?.trim();
                const _res = projectData.respondents?.[0]?.name?.trim();
                const _petPart = _pet ? _firstWords(_pet, 3) : '';
                const _resPart = _res ? _firstWords(_res, 3) : '';
                const caseName = _petPart && _resPart ? `${_petPart} v. ${_resPart}` : _petPart || _resPart || 'Untitled';
                const baseFileName = `${caseName} Paperbook.pdf`;
                
                // Try Electron first (with default path)
                try {
                    if (typeof window !== "undefined" && window.electron?.savePdf) {
                        const settings = getSettings();
                        const savedPath = await window.electron.savePdf({
                            fileName: baseFileName,
                            content: result.pdf,
                            defaultPath: settings.defaultPdfPath || undefined,
                        });
                        if (savedPath) {
                            setProgress(100);
                            incrementGenerationCount('paperbook');
                            toast({ title: "PDF Generated", description: `Saved to ${savedPath}` });
                            window.electron.revealFilePath?.(savedPath);
                            offerBriefingNote();
                            onClose();
                            return;
                        }
                    }
                } catch (err) {
                    console.error("Electron PDF save failed, falling back to download:", err);
                }
                
                // Fallback to browser download
                const byteCharacters = atob(result.pdf);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: "application/pdf" });
                saveAs(blob, baseFileName);
                setProgress(100);
                incrementGenerationCount('paperbook');
                toast({ title: "PDF Generated", description: "Your paper book has been downloaded." });
                offerBriefingNote();
            } else {
                 setErrorMessage(result.message || "An unknown error occurred.");
                 setErrorDialogOpen(true);
            }
        } catch (error) {
            if (cancelledRef.current) return;
            const errorMessageStr = error instanceof Error ? error.message : "An unknown error occurred during PDF generation.";
            setErrorMessage(errorMessageStr);
            setErrorDialogOpen(true);
        } finally {
            setIsGenerating(false);
        }
    };

    // ── Non-upload requirements ───────────────────────────────────────────────
    // A few mandatory inputs aren't files: the Certified Copy Receipt's date, for
    // instance, is typed in the Applications tab. These used to block the Go
    // button without appearing anywhere in the list below, so the list looked
    // complete while generation stayed locked. They now get a row of their own.
    type DataRequirement = {
        id: string;
        label: string;          // shown in the list and in the Go tooltip
        fix: string;            // where the user supplies it
        value: string | null;   // the current value, once supplied
        sectionKey: string;     // section this belongs to
        afterId?: string;       // list row it sits under
    };

    const dataRequirements: DataRequirement[] = useMemo(() => {
        const reqs: DataRequirement[] = [];
        const isScWp = isScWpFamily((mainFormValues as Partial<DraftoProject>).courtType);
        if (isScWp) return reqs;

        const cc = (mainFormValues as Partial<DraftoProject>).standardIas?.exemptionCertifiedCopy;
        // Only when the exemption-from-certified-copy IA is included and the
        // petitioner has applied — that's the case that puts the receipt (and its
        // date) into the IA and the Annexure-A description.
        if (cc?.active && cc?.hasApplied === 'yes') {
            // Saved projects carry the date as a string, so re-parse before formatting.
            const parsed = cc.receiptDate ? new Date(cc.receiptDate as any) : null;
            reqs.push({
                id: 'certified_copy_receipt_date',
                label: 'Certified Copy Receipt: date of the receipt',
                fix: 'Set in Applications tab',
                value: parsed && !Number.isNaN(parsed.getTime()) ? format(parsed, 'dd.MM.yyyy') : null,
                sectionKey: 'ias',
                afterId: 'certified_copy_receipt',
            });
        }
        return reqs;
    }, [mainFormValues]);

    const getMissingUploads = () => {
        if (!watchedItems || watchedItems.length === 0) return [];
    
        const allAnnexures = mainForm.getValues('listOfDates').flatMap(lod => lod.annexures || []);
    
        const missing = watchedItems
            .filter(item => {
                if (item.useSystem) return false;
                if (item.userFile instanceof File) return false;
    
                if (item.id.startsWith('annexure_')) {
                    const [_, annexureId, suffix] = item.id.split('_');
                    const annex = allAnnexures.find(a => a.id === annexureId);
                    if (!annex) return true;
        
                    const fileToCheck = suffix === 'typed' ? annex.typedOrTranslatedFile : annex.file;
                    return !(fileToCheck instanceof File);
                }
        
                if (isAppendixComponentId(item.id)) {
                    const appendixItem = getAppendixItems(mainForm.getValues())
                        .find(i => i.id === appendixItemIdFromComponentId(item.id));
                    if (!appendixItem || appendixItem.useManual) return false;
                    return !(appendixItem.file instanceof File);
                }

                const isRequired =
                    USER_UPLOAD_REQUIRED_IDS.some(prefix => item.id.startsWith(prefix)) &&
                    !isOptionalUpload(item.id);
                if (isRequired) {
                    return !(item.userFile instanceof File);
                }
    
                return false;
            })
            .map(item => item.label);

        // Non-file requirements (e.g. the Certified Copy Receipt date) block
        // generation too, and are listed alongside the missing uploads.
        dataRequirements
            .filter(req => !req.value)
            .forEach(req => missing.push(`${req.label} — ${req.fix.toLowerCase()}`));

        return missing;
    };

    const missingUploads = getMissingUploads();
    const isGoButtonDisabled = isGenerating;

    // ── Grouping + per-section readiness (kept in sync with the header by reusing
    // the same missing-upload computations) ──
    const sectionForId = (id: string): { key: 'initial' | 'annexures' | 'tail'; label: string } => {
        if (id.startsWith('annexure_')) {
            return { key: 'annexures', label: 'Annexures' };
        }
        if (
            id.startsWith('ia_') ||
            id === 'certified_copy_receipt' ||
            id === 'custodyCertificate' ||
            id === 'firDetails' ||
            id === 'proofOfService' ||
            id === 'memoOfParties' ||
            id === 'filingMemo' ||
            id === 'vakalatnama'
        ) {
            return { key: 'tail', label: 'Tail (after annexures)' };
        }
        return { key: 'initial', label: 'Initial (before annexures)' };
    };
    const optionalMissing = getMissingOptionalDocs({ mergeItems: watchedItems });
    const mandatoryMissingSet = new Set(missingUploads);
    const optionalMissingSet = new Set(optionalMissing);
    const itemStatus = (it: MergeItem): 'ready' | 'mandatory' | 'optional' =>
        mandatoryMissingSet.has(it.label) ? 'mandatory' : optionalMissingSet.has(it.label) ? 'optional' : 'ready';
    // Build ordered sections (strictly 'initial', 'annexures', 'tail')
    type ListRow =
        | { kind: 'item'; item: MergeItem; index: number; sNo: string | number }
        | { kind: 'requirement'; req: DataRequirement };
    const SECTION_DEFS: { key: 'initial' | 'annexures' | 'tail'; label: string }[] = [
        { key: 'initial', label: 'Initial (before annexures)' },
        { key: 'annexures', label: 'Annexures' },
        { key: 'tail', label: 'Tail (after annexures)' },
    ];
    const sections: { key: 'initial' | 'annexures' | 'tail'; label: string; status: 'ready' | 'mandatory' | 'optional'; rows: ListRow[] }[] =
        SECTION_DEFS.map(def => ({ key: def.key, label: def.label, status: 'ready', rows: [] }));

    let currentSNo = 1;
    watchedItems.forEach((item, index) => {
        if (!item) return;
        const { key } = sectionForId(item.id);
        const sec = sections.find(s => s.key === key)!;
        let sNo: string | number = '—';
        if (item.id !== 'refiling' && item.id !== 'advocateChecklist') {
            sNo = currentSNo++;
        }
        sec.rows.push({ kind: 'item', item, index, sNo });
    });
    // Slot each non-upload requirement directly under the row it belongs to.
    dataRequirements.forEach((req) => {
        const sec = sections.find((s) => s.key === (req.sectionKey === 'ias' ? 'tail' : req.sectionKey));
        if (!sec) return; // still surfaced in the Go tooltip
        const anchor = req.afterId
            ? sec.rows.findIndex((r) => r.kind === 'item' && r.item.id === req.afterId)
            : -1;
        const row: ListRow = { kind: 'requirement', req };
        if (anchor >= 0) sec.rows.splice(anchor + 1, 0, row);
        else sec.rows.push(row);
    });
    const rowStatus = (r: ListRow): 'ready' | 'mandatory' | 'optional' =>
        r.kind === 'item' ? itemStatus(r.item) : r.req.value ? 'ready' : 'mandatory';
    for (const sec of sections) {
        const statuses = sec.rows.map(rowStatus);
        sec.status = statuses.includes('mandatory') ? 'mandatory' : statuses.includes('optional') ? 'optional' : 'ready';
    }
    // Overall readiness for the header.
    const mandatoryCount = missingUploads.length;
    const optionalCount = optionalMissing.length;
    const overallStatus: 'ready' | 'mandatory' | 'optional' =
        mandatoryCount > 0 ? 'mandatory' : optionalCount > 0 ? 'optional' : 'ready';

    // Status chip (shared by header + section headers).
    const STATUS_META = {
        ready: { label: 'Ready', cls: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400' },
        mandatory: { label: 'Not Ready', cls: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400' },
        optional: { label: 'Optional pending', cls: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
    } as const;
    const StatusChip = ({ status }: { status: 'ready' | 'mandatory' | 'optional' }) => (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", STATUS_META[status].cls)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", status === 'ready' ? 'bg-green-500' : status === 'mandatory' ? 'bg-red-500' : 'bg-yellow-500')} />
            {STATUS_META[status].label}
        </span>
    );

    const getFileStatus = (item: MergeItem) => {
        if (item.userFile instanceof File) return item.userFile.name;

        if (item.id.startsWith('annexure_')) {
            // Extract annexure ID - handle IDs that contain underscores
            const withoutPrefix = item.id.substring('annexure_'.length);
            const isTyped = withoutPrefix.endsWith('_typed');
            const annexureId = isTyped ? withoutPrefix.substring(0, withoutPrefix.length - '_typed'.length) : withoutPrefix;
            
            const annex = mainForm.getValues('listOfDates').flatMap(l => l.annexures || []).find(a => a.id === annexureId);
            if (!annex) return "Upload Required";
            
            const fileToCheck = isTyped ? annex.typedOrTranslatedFile : annex.file;
            return fileToCheck instanceof File ? fileToCheck.name : "Upload Required";
        }

        if (isAppendixComponentId(item.id)) {
            const appendixItem = getAppendixItems(mainForm.getValues())
                .find(i => i.id === appendixItemIdFromComponentId(item.id));
            if (!appendixItem) return 'Upload Required';
            if (appendixItem.useManual) {
                return (appendixItem.manualEntry || '').trim() ? 'Typed out' : 'Upload Required';
            }
            return appendixItem.file instanceof File ? (appendixItem.file as File).name : 'Upload Required';
        }

        if (item.id === 'certified_copy_receipt') {
            const receiptFile = mainForm.getValues('standardIas.exemptionCertifiedCopy.receiptFile');
            return receiptFile instanceof File ? receiptFile.name : 'Upload Required';
        }

        return "Upload Required";
    };

    // ── TWO-COLUMN PREPARATION ──
    const isScWp = isScWpFamily(mainFormValues.courtType);
    const activeLodRows = annexureRowsOf(mainFormValues as DraftoProject);
    const allAnnexures: (Annexure & { lodId: string })[] = activeLodRows.flatMap(lod => (lod.annexures || []).map(a => ({ ...a, lodId: lod.id })));

    const annexureNumberingMap = new Map<string, number>();
    let pCounter = 1;
    const nonAdAnnexures = allAnnexures.filter(a => !a.isAdditionalDocument);
    const adAnnexures = allAnnexures.filter(a => a.isAdditionalDocument);

    if (isScWp) {
        const scWpOrder = wpAnnexureOrderFromLods(activeLodRows);
        scWpOrder.forEach(e => annexureNumberingMap.set(e.annex.id, e.pNumber));
    } else {
        nonAdAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));
        adAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));
    }

    // Collect IA ground annexures
    const allIaAnnexures: any[] = [];
    if (!isScWp && (mainFormValues as any).standardIas?.condonationOfDelay?.active) {
        (mainFormValues as any).standardIas.condonationOfDelay.grounds?.forEach((ground: any) => {
            if (ground.annexures) {
                ground.annexures.forEach((annex: any) => {
                    allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelay' });
                });
            }
        });
    }
    if (!isScWp && (mainFormValues as any).standardIas?.condonationOfDelayInRefiling?.active) {
        (mainFormValues as any).standardIas.condonationOfDelayInRefiling.grounds?.forEach((ground: any) => {
            if (ground.annexures) {
                ground.annexures.forEach((annex: any) => {
                    allIaAnnexures.push({ ...annex, iaId: 'condonationOfDelayInRefiling' });
                });
            }
        });
    }
    if ((mainFormValues as any).standardIas?.exemptionFromSurrendering?.active) {
        (mainFormValues as any).standardIas.exemptionFromSurrendering.grounds?.forEach((ground: any) => {
            if (ground.annexures) {
                ground.annexures.forEach((annex: any) => {
                    allIaAnnexures.push({ ...annex, iaId: 'exemptionFromSurrendering' });
                });
            }
        });
    }
    if ((mainFormValues as any).customIas && (mainFormValues as any).customIas.length > 0) {
        (mainFormValues as any).customIas.forEach((customIa: any) => {
            if (customIa.grounds) {
                customIa.grounds.forEach((ground: any) => {
                    if (ground.annexures) {
                        ground.annexures.forEach((annex: any) => {
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

    const iasList = isScWp ? getScWpIaList(mainFormValues as DraftoProject) : getIaList(mainFormValues as DraftoProject);
    const iaItemIds = new Set<string>();
    iasList.forEach(ia => {
        iaItemIds.add(`ia_${ia.id}`);
        iaItemIds.add(`ia_affidavit_${ia.id}`);
    });
    iaItemIds.add('certified_copy_receipt');

    // Left Column entries
    interface LeftEntry {
        key: string;
        kind: 'regular' | 'ia' | 'requirement';
        title: string;
        isPending: boolean;
        regularItem?: MergeItem;
        regularIndex?: number;
        iaMainItem?: MergeItem;
        iaMainIndex?: number;
        iaAffidavitItem?: MergeItem;
        iaAffidavitIndex?: number;
        iaReceiptItem?: MergeItem;
        iaReceiptIndex?: number;
        req?: DataRequirement;
    }

    const leftEntries: LeftEntry[] = [];
    const impugnedOrderCount = (mainFormValues.impugnedOrders || []).length;

    watchedItems.forEach((item, index) => {
        if (!item) return;
        if (item.id.startsWith('annexure_') || item.id.startsWith('ia_annexure_')) return;
        if (iaItemIds.has(item.id)) return;

        let displayTitle = item.label;
        if (item.id.startsWith('impugnedOrder_')) {
            if (impugnedOrderCount <= 1) {
                displayTitle = "Impugned Order";
            } else {
                const orderIdx = (mainFormValues.impugnedOrders || []).findIndex(o => `impugnedOrder_${o.id}` === item.id);
                displayTitle = orderIdx >= 0 ? `Impugned Order ${orderIdx + 1}` : item.label;
            }
        }

        const status = itemStatus(item);
        const isPending = status !== 'ready';
        leftEntries.push({
            key: item.id,
            kind: 'regular',
            title: displayTitle,
            isPending,
            regularItem: item,
            regularIndex: index,
        });
    });

    // Add combined IAs to left column
    iasList.forEach(ia => {
        const iaMainIdx = watchedItems.findIndex(it => it.id === `ia_${ia.id}`);
        const iaAffidavitIdx = watchedItems.findIndex(it => it.id === `ia_affidavit_${ia.id}`);
        const iaReceiptIdx = (ia.id === 'exemptionCertifiedCopy') ? watchedItems.findIndex(it => it.id === 'certified_copy_receipt') : -1;

        const iaMainItem = iaMainIdx >= 0 ? watchedItems[iaMainIdx] : undefined;
        const iaAffidavitItem = iaAffidavitIdx >= 0 ? watchedItems[iaAffidavitIdx] : undefined;
        const iaReceiptItem = iaReceiptIdx >= 0 ? watchedItems[iaReceiptIdx] : undefined;

        const affidavitUploaded = iaAffidavitItem?.userFile instanceof File;
        const receiptUploaded = iaReceiptItem ? iaReceiptItem.userFile instanceof File : true;
        const isPending = !affidavitUploaded || !receiptUploaded;

        leftEntries.push({
            key: `ia_combined_${ia.id}`,
            kind: 'ia',
            title: getCompactIaTitle(ia.id, ia.title),
            isPending,
            iaMainItem,
            iaMainIndex: iaMainIdx,
            iaAffidavitItem,
            iaAffidavitIndex: iaAffidavitIdx,
            iaReceiptItem,
            iaReceiptIndex: iaReceiptIdx,
        });
    });

    // Add non-file data requirements to left column
    dataRequirements.forEach(req => {
        leftEntries.push({
            key: `req_${req.id}`,
            kind: 'requirement',
            title: req.label,
            isPending: !req.value,
            req,
        });
    });

    // Right Column: Annexures
    interface RightAnnexureCopy {
        label: string;
        item?: MergeItem;
        index: number;
        isUploaded: boolean;
        fileName?: string;
    }

    interface RightAnnexureEntry {
        key: string;
        prefixAndNum: string;
        title: string;
        date?: string;
        isPending: boolean;
        copies: RightAnnexureCopy[];
    }

    const rightAnnexureEntries: RightAnnexureEntry[] = [];
    const annexPrefixStr = annexurePrefix(mainFormValues.courtType);
    const cleanAnnexPrefix = (annexPrefixStr || "P").replace(/-+$/, '');

    allAnnexures.forEach(a => {
        const pNum = annexureNumberingMap.get(a.id);
        const prefixAndNum = `${cleanAnnexPrefix}${pNum !== undefined ? pNum : '?'}`;
        
        const trueIdx = watchedItems.findIndex(it => it.id === `annexure_${a.id}`);
        const trueItem = trueIdx >= 0 ? watchedItems[trueIdx] : undefined;
        const isTrueUploaded = (trueItem?.userFile instanceof File) || (a.file instanceof File);
        const trueFileName = trueItem?.userFile instanceof File ? trueItem.userFile.name : (a.file instanceof File ? a.file.name : (a.filePath ? String(a.filePath).split(/[\\/]/).pop() : ""));

        const typedIdx = watchedItems.findIndex(it => it.id === `annexure_${a.id}_typed`);
        const typedItem = typedIdx >= 0 ? watchedItems[typedIdx] : undefined;
        const isTypedUploaded = (typedItem?.userFile instanceof File) || (a.typedOrTranslatedFile instanceof File);
        const typedFileName = typedItem?.userFile instanceof File ? typedItem.userFile.name : (a.typedOrTranslatedFile instanceof File ? a.typedOrTranslatedFile.name : (a.typedOrTranslatedFilePath ? String(a.typedOrTranslatedFilePath).split(/[\\/]/).pop() : ""));

        const copies: RightAnnexureCopy[] = [];
        if (a.copyType === "true and translated copy") {
            copies.push({ label: "True", item: trueItem, index: trueIdx, isUploaded: isTrueUploaded, fileName: trueFileName });
            copies.push({ label: "Translated", item: typedItem, index: typedIdx, isUploaded: isTypedUploaded, fileName: typedFileName });
        } else if (a.copyType === "true and typed copy") {
            copies.push({ label: "True", item: trueItem, index: trueIdx, isUploaded: isTrueUploaded, fileName: trueFileName });
            copies.push({ label: "Typed", item: typedItem, index: typedIdx, isUploaded: isTypedUploaded, fileName: typedFileName });
        } else if (a.copyType === "translated copy") {
            copies.push({ label: "Translated", item: trueItem, index: trueIdx, isUploaded: isTrueUploaded, fileName: trueFileName });
        } else if (a.copyType === "typed copy") {
            copies.push({ label: "Typed", item: trueItem, index: trueIdx, isUploaded: isTrueUploaded, fileName: trueFileName });
        } else {
            copies.push({ label: "True", item: trueItem, index: trueIdx, isUploaded: isTrueUploaded, fileName: trueFileName });
        }

        const isPending = copies.some(c => !c.isUploaded);
        rightAnnexureEntries.push({
            key: `annex_${a.id}`,
            prefixAndNum,
            title: cleanAnnexureTitle(a.title),
            date: a.date || undefined,
            isPending,
            copies,
        });
    });

    // Also add any IA ground annexures (A-series) to the Right Column
    allIaAnnexures.forEach(a => {
        const aNum = iaAnnexureNumberingMap.get(a.id);
        const prefixAndNum = `A${aNum !== undefined ? aNum : '?'}`;
        const idx = watchedItems.findIndex(it => it.id === `ia_annexure_${a.id}`);
        const item = idx >= 0 ? watchedItems[idx] : undefined;
        const isUploaded = (item?.userFile instanceof File) || (a.file instanceof File);
        const fileName = item?.userFile instanceof File ? item.userFile.name : (a.file instanceof File ? a.file.name : (a.filePath ? String(a.filePath).split(/[\\/]/).pop() : ""));

        rightAnnexureEntries.push({
            key: `ia_annex_${a.id}`,
            prefixAndNum,
            title: cleanAnnexureTitle(a.title),
            date: a.date || undefined,
            isPending: !isUploaded,
            copies: [{ label: "True", item, index: idx, isUploaded, fileName }],
        });
    });

    const visibleLeft = showFilter === "pending" ? leftEntries.filter(e => e.isPending) : leftEntries;
    const visibleRight = showFilter === "pending" ? rightAnnexureEntries.filter(e => e.isPending) : rightAnnexureEntries;

    const GoButtonWrapper = ({ children }: { children: React.ReactNode }) => {
        return <>{children}</>;
    };

    return (
        <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Paperbook Generator</DialogTitle>
            </DialogHeader>

            {/* Readiness summary — synced with the per-section status chips */}
            <div className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
                overallStatus === 'mandatory' ? 'border-red-500/30 bg-red-500/5'
                    : overallStatus === 'optional' ? 'border-yellow-500/30 bg-yellow-500/5'
                    : 'border-green-500/30 bg-green-500/5'
            )}>
                <span className="font-medium">
                    {overallStatus === 'mandatory'
                        ? `Not ready — ${mandatoryCount} item${mandatoryCount === 1 ? '' : 's'} needed before you can generate.`
                        : overallStatus === 'optional'
                            ? `Ready to generate — ${optionalCount} optional upload${optionalCount === 1 ? '' : 's'} still pending.`
                            : 'All set — ready to generate.'}
                </span>
                <StatusChip status={overallStatus} />
            </div>

            {/* Show filter toggle */}
            <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-xs select-none">
                    <span className="text-muted-foreground font-medium">Show:</span>
                    <div className="inline-flex items-center rounded-md border border-input/60 bg-muted/40 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setShowFilter('pending')}
                            className={cn(
                                "rounded px-2.5 py-1 font-medium transition-all cursor-pointer",
                                showFilter === 'pending'
                                    ? "bg-background text-primary shadow-xs font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Pending Items
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowFilter('all')}
                            className={cn(
                                "rounded px-2.5 py-1 font-medium transition-all cursor-pointer",
                                showFilter === 'all'
                                    ? "bg-background text-foreground shadow-xs font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            All Items
                        </button>
                    </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {showFilter === 'pending'
                        ? `${visibleLeft.length + visibleRight.length} pending items`
                        : `${leftEntries.length + rightAnnexureEntries.length} total items`}
                </div>
            </div>

            <FormProvider {...uploadForm}>
                <form onSubmit={handleSubmit(onSubmit)} id="pdf-upload-form" className="flex flex-col flex-1 min-h-0">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 pt-1">
                        {/* LEFT COLUMN: Petition & Applications */}
                        <div className="flex flex-col border rounded-lg bg-card overflow-hidden">
                            <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-1.5">
                                    Petition & Applications
                                    <span className="text-[11px] font-normal text-muted-foreground">({visibleLeft.length})</span>
                                </span>
                                <div className="inline-flex items-center rounded-md border border-input/60 bg-muted/40 p-0.5 text-[10px] leading-none select-none">
                                    <button
                                        type="button"
                                        onClick={() => setLeftWrap(true)}
                                        className={cn(
                                            "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                                            leftWrap
                                                ? "bg-background text-primary shadow-xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Wrap
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLeftWrap(false)}
                                        className={cn(
                                            "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                                            !leftWrap
                                                ? "bg-background text-foreground shadow-xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        No Wrap
                                    </button>
                                </div>
                            </div>
                            <ScrollArea className="h-[48vh] w-full">
                                <div className={cn("px-3 py-1.5 space-y-0.5", leftWrap ? "w-full" : "min-w-[480px]")}>
                                    {visibleLeft.map((entry) => {
                                        if (entry.kind === 'ia') {
                                            const isIaOverridden = entry.iaMainItem?.userFile instanceof File;
                                            const isAffUploaded = entry.iaAffidavitItem?.userFile instanceof File;
                                            const isRecUploaded = entry.iaReceiptItem?.userFile instanceof File;

                                            return (
                                                <div
                                                    key={entry.key}
                                                    className={cn(
                                                        "flex justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0 gap-2 text-xs",
                                                        leftWrap ? "items-start" : "items-center"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "text-foreground font-medium",
                                                            leftWrap ? "min-w-0 flex-1 break-words leading-tight" : "truncate"
                                                        )}
                                                        title={entry.title}
                                                    >
                                                        {entry.title}
                                                    </span>
                                                    <div className={cn("shrink-0 flex items-center gap-1.5", leftWrap && "mt-0.5")}>
                                                        {entry.iaMainIndex !== undefined && entry.iaMainIndex >= 0 && (
                                                            <ActionPill
                                                                label="Ready"
                                                                isUploaded={true}
                                                                fileName={isIaOverridden ? entry.iaMainItem!.userFile!.name : undefined}
                                                                onClick={() => triggerFileUpload(entry.iaMainIndex!)}
                                                                onRemove={isIaOverridden ? () => handleRemoveFile(entry.iaMainIndex!) : undefined}
                                                            />
                                                        )}
                                                        {entry.iaAffidavitIndex !== undefined && entry.iaAffidavitIndex >= 0 && (
                                                            <ActionPill
                                                                label="Affidavit"
                                                                isUploaded={isAffUploaded}
                                                                isOptional={true}
                                                                fileName={isAffUploaded ? entry.iaAffidavitItem!.userFile!.name : undefined}
                                                                onClick={() => triggerFileUpload(entry.iaAffidavitIndex!)}
                                                                onRemove={isAffUploaded ? () => handleRemoveFile(entry.iaAffidavitIndex!) : undefined}
                                                            />
                                                        )}
                                                        {entry.iaReceiptIndex !== undefined && entry.iaReceiptIndex >= 0 && (
                                                            <ActionPill
                                                                label="Receipt"
                                                                isUploaded={isRecUploaded}
                                                                isOptional={true}
                                                                fileName={isRecUploaded ? entry.iaReceiptItem!.userFile!.name : undefined}
                                                                onClick={() => triggerFileUpload(entry.iaReceiptIndex!)}
                                                                onRemove={isRecUploaded ? () => handleRemoveFile(entry.iaReceiptIndex!) : undefined}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (entry.kind === 'requirement') {
                                            return (
                                                <div
                                                    key={entry.key}
                                                    className={cn(
                                                        "flex justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0 gap-2 text-xs",
                                                        leftWrap ? "items-start" : "items-center"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "text-muted-foreground",
                                                            leftWrap ? "min-w-0 flex-1 break-words leading-tight" : "truncate"
                                                        )}
                                                        title={entry.title}
                                                    >
                                                        {entry.title}
                                                    </span>
                                                    <div className={cn("shrink-0", leftWrap && "mt-0.5")}>
                                                        {entry.req?.value ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400">
                                                                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                                                {entry.req.value}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" title={entry.req?.fix}>
                                                                <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                                                {entry.req?.fix}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Regular petition item
                                        const item = entry.regularItem!;
                                        const index = entry.regularIndex!;
                                        const isSystemMode = item.useSystem;
                                        const hasFile = item.userFile instanceof File;
                                        const isOptionalCriminal = item.id === 'custodyCertificate' || item.id === 'firDetails' || item.id === 'proofOfService';
                                        const isOptional = isOptionalCriminal || isOptionalUpload(item.id);
                                        const isLocked = item.id === 'ci';

                                        return (
                                            <div
                                                key={entry.key}
                                                className={cn(
                                                    "flex justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0 gap-2 text-xs",
                                                    leftWrap ? "items-start" : "items-center"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "text-foreground font-medium",
                                                        leftWrap ? "min-w-0 flex-1 break-words leading-tight" : "truncate"
                                                    )}
                                                    title={entry.title}
                                                >
                                                    {entry.title}
                                                </span>
                                                <div className={cn("shrink-0 flex items-center gap-1", leftWrap && "mt-0.5")}>
                                                    {isLocked ? (
                                                        <ActionPill
                                                            label="Ready"
                                                            isUploaded={true}
                                                            disabled={true}
                                                        />
                                                    ) : hasFile ? (
                                                        <ActionPill
                                                            label="Ready"
                                                            isUploaded={true}
                                                            fileName={item.userFile!.name}
                                                            onClick={() => triggerFileUpload(index)}
                                                            onRemove={isOptional ? () => handleRemoveFile(index) : undefined}
                                                        />
                                                    ) : isSystemMode ? (
                                                        <ActionPill
                                                            label="Ready"
                                                            isUploaded={true}
                                                            disabled={false}
                                                            onClick={() => triggerFileUpload(index)}
                                                        />
                                                    ) : (
                                                        <ActionPill
                                                            label="Upload"
                                                            isUploaded={false}
                                                            isOptional={isOptional}
                                                            onClick={() => triggerFileUpload(index)}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {visibleLeft.length === 0 && (
                                        <div className="h-36 flex flex-col items-center justify-center text-center p-4 text-muted-foreground text-xs gap-1">
                                            <CheckCircle2 className="h-5 w-5 text-green-500/80 mb-0.5" />
                                            <span className="font-medium text-foreground">
                                                {showFilter === 'pending' ? 'All items ready' : 'No components to display'}
                                            </span>
                                            {showFilter === 'pending' && (
                                                <span className="text-[11px] text-muted-foreground/80">No pending uploads or requirements.</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!leftWrap && <ScrollBar orientation="horizontal" />}
                            </ScrollArea>
                        </div>

                        {/* RIGHT COLUMN: Annexures */}
                        <div className="flex flex-col border rounded-lg bg-card overflow-hidden">
                            <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-1.5">
                                    Annexures
                                    <span className="text-[11px] font-normal text-muted-foreground">({visibleRight.length})</span>
                                </span>
                                <div className="inline-flex items-center rounded-md border border-input/60 bg-muted/40 p-0.5 text-[10px] leading-none select-none">
                                    <button
                                        type="button"
                                        onClick={() => setRightWrap(true)}
                                        className={cn(
                                            "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                                            rightWrap
                                                ? "bg-background text-primary shadow-xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Wrap
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRightWrap(false)}
                                        className={cn(
                                            "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                                            !rightWrap
                                                ? "bg-background text-foreground shadow-xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        No Wrap
                                    </button>
                                </div>
                            </div>
                            <ScrollArea className="h-[48vh] w-full">
                                <div className={cn("px-3 py-1.5 space-y-0.5", rightWrap ? "w-full" : "min-w-[540px]")}>
                                    {visibleRight.map((entry) => (
                                        <div
                                            key={entry.key}
                                            className={cn(
                                                "flex justify-between py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors border-b border-border/40 last:border-b-0 gap-3 text-xs",
                                                rightWrap ? "items-start" : "items-center"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "pr-2",
                                                    rightWrap ? "min-w-0 flex-1 break-words leading-tight" : "min-w-0 flex-1 truncate"
                                                )}
                                                title={`${entry.prefixAndNum}: ${entry.title}${entry.date ? ` [${entry.date}]` : ''}`}
                                            >
                                                <span className="font-semibold text-primary mr-1.5 whitespace-nowrap">{entry.prefixAndNum}:</span>
                                                <span className="text-foreground">{entry.title}</span>
                                                {entry.date && (
                                                    <span className="text-muted-foreground ml-1.5 font-normal whitespace-nowrap">[{entry.date}]</span>
                                                )}
                                            </div>
                                            <div className={cn("shrink-0 flex items-center gap-1.5 ml-auto", rightWrap && "mt-0.5")}>
                                                {entry.copies.map((copy, cIdx) => (
                                                    <ActionPill
                                                        key={`${entry.key}_copy_${cIdx}`}
                                                        label={copy.label}
                                                        isUploaded={copy.isUploaded}
                                                        isOptional={false}
                                                        fileName={copy.fileName}
                                                        onClick={() => {
                                                            if (copy.index >= 0) {
                                                                triggerFileUpload(copy.index);
                                                            }
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {visibleRight.length === 0 && (
                                        <div className="h-36 flex flex-col items-center justify-center text-center p-4 text-muted-foreground text-xs gap-1">
                                            <CheckCircle2 className="h-5 w-5 text-green-500/80 mb-0.5" />
                                            <span className="font-medium text-foreground">
                                                {showFilter === 'pending' ? 'All annexures uploaded' : 'No annexures in this case'}
                                            </span>
                                            {showFilter === 'pending' && (
                                                <span className="text-[11px] text-muted-foreground/80">Every annexure copy has been uploaded.</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {!rightWrap && <ScrollBar orientation="horizontal" />}
                            </ScrollArea>
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf"
                        onChange={handleFileChange}
                    />
                </form>
                <div className="mt-4 border-t pt-3 space-y-1.5">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="is-refiling"
                            checked={isRefiling}
                            onCheckedChange={(checked) => setIsRefiling(checked as boolean)}
                            disabled={isGenerating}
                        />
                        <label htmlFor="is-refiling" className="text-xs font-medium cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Include Re-filing Declaration
                        </label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="enable-ocr"
                            checked={enableOcr}
                            onCheckedChange={(checked) => setEnableOcr(checked as boolean)}
                            disabled={isGenerating || isMac}
                        />
                        <label htmlFor="enable-ocr" className="text-xs font-medium cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            OCR (Windows-only, takes longer)
                        </label>
                    </div>
                    {(isGenerating || isProcessingOcr) && (progressLabel || isProcessingOcr) && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" /> {isProcessingOcr ? "Running OCR…" : progressLabel}
                        </p>
                    )}
                </div>
            </FormProvider>
            <DialogFooter>
                <Button type="button" variant="secondary" onClick={handleBack} disabled={isGenerating}>
                    Back
                </Button>
                <GoButtonWrapper>
                    <Button type="submit" form="pdf-upload-form" disabled={isGoButtonDisabled}>
                        {(isGenerating || isProcessingOcr) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isProcessingOcr ? "Processing OCR..." : isGenerating ? `Generating ${progress}%` : "Go"}
                    </Button>
                </GoButtonWrapper>
            </DialogFooter>
            {/* Warning for missing mandatory documents (generate with placeholders) */}
            <AlertDialog open={showIncompleteWarning} onOpenChange={setShowIncompleteWarning}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-semibold text-amber-600 dark:text-amber-500 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 shrink-0" />
                            <span>Incomplete Paperbook</span>
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
                            <strong className="font-semibold text-foreground">Warning:</strong> This will generate an{" "}
                            <strong className="font-semibold text-foreground">incomplete paperbook</strong> which is not ready to be filed. Since the following mandatory documents have not been uploaded, Drafto will use placeholders in their stead:
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="max-h-44 overflow-y-auto rounded-md border bg-muted/30 p-2.5 my-1">
                        <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                            {missingUploads.map((label, idx) => (
                                <li key={idx} className="text-foreground leading-snug">
                                    {label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs font-medium text-foreground">Do you wish to proceed anyway?</p>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => { setShowIncompleteWarning(false); pendingSubmitData.current = null; }}
                            className="text-xs h-8 cursor-pointer"
                        >
                            No
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setShowIncompleteWarning(false);
                                confirmedIncompleteRef.current = true;
                                if (pendingSubmitData.current) onSubmit(pendingSubmitData.current);
                            }}
                            className="text-xs h-8 cursor-pointer"
                        >
                            Yes
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Warning for missing optional Criminal SLP documents */}
            <AlertDialog open={showCriminalDocWarning} onOpenChange={setShowCriminalDocWarning}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-semibold flex items-center gap-2">
                            <span>Missing Optional Documents</span>
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
                            The following documents have not been attached. They are optional — you can proceed without them:
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="max-h-44 overflow-y-auto rounded-md border bg-muted/30 p-2.5 my-1">
                        <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                            {pendingSubmitData.current && getMissingOptionalDocs(pendingSubmitData.current).map(label => (
                                <li key={label} className="text-foreground leading-snug">{label}</li>
                            ))}
                        </ul>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => { setShowCriminalDocWarning(false); pendingSubmitData.current = null; }}
                            className="text-xs h-8 cursor-pointer"
                        >
                            Go Back
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setShowCriminalDocWarning(false);
                                confirmedOptionalRef.current = true;
                                if (pendingSubmitData.current) onSubmit(pendingSubmitData.current);
                            }}
                            className="text-xs h-8 cursor-pointer"
                        >
                            Proceed Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>PDF Generation Failed</AlertDialogTitle>
                        <AlertDialogDescription>
                            The following error occurred. Please copy the text and report it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="mt-2 w-full rounded-md bg-slate-950 p-4 max-h-60 overflow-y-auto">
                        <pre className="text-white text-xs whitespace-pre-wrap break-words">{errorMessage}</pre>
                    </div>
                    <AlertDialogAction asChild>
                       <Button onClick={() => setErrorDialogOpen(false)}>Close</Button>
                    </AlertDialogAction>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>PDF Generation in Progress</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action will terminate the PDF generation process. Continue?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmClose}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </DialogContent>
    );
}


export function PdfGenerationDialog({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [preCheckOpen, setPreCheckOpen] = useState(false);
    const [validation, setValidation] = useState<ValidationResult>({ warnings: [], issues: [] });
    const isGeneratingRef = useRef(false);
    const [showOuterCloseConfirm, setShowOuterCloseConfirm] = useState(false);
    const mainForm = useFormContext<DraftoProject>();

    const handleGeneratingChange = useCallback((v: boolean) => {
        isGeneratingRef.current = v;
    }, []);

    const handleTriggerClick = () => {
        const data = mainForm.getValues();
        const result = validateProjectForPdf(data);
        setValidation(result);
        if (result.warnings.length > 0 || result.issues.length > 0) {
            setPreCheckOpen(true);
        } else {
            setIsOpen(true);
        }
    };

    // Let Mayur (the AI assistant) open the paperbook compiler from its readiness
    // strip — same entry point as clicking the toolbar's Export PDF button.
    useEffect(() => {
        const openFromAssistant = () => handleTriggerClick();
        window.addEventListener("drafto-open-paperbook", openFromAssistant);
        return () => window.removeEventListener("drafto-open-paperbook", openFromAssistant);
    });

    const handleProceedAnyway = () => {
        setPreCheckOpen(false);
        setIsOpen(true);
    };

    const hasIssues = validation.issues.length > 0;

    return (
        <>
            {React.cloneElement(children as React.ReactElement, { onClick: handleTriggerClick })}

            {/* Pre-check dialog */}
            <Dialog open={preCheckOpen} onOpenChange={setPreCheckOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            {hasIssues ? 'Some fields appear to be blank' : 'Note'}
                        </DialogTitle>
                        {hasIssues && (
                            <DialogDescription className="text-xs">
                                The following fields were found to be blank. Do you wish to go back and fill them, or proceed anyway?
                            </DialogDescription>
                        )}
                    </DialogHeader>
                    <ScrollArea className="max-h-[55vh] pr-2">
                        <div className="space-y-4">
                            {validation.warnings.map((w, i) => (
                                <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs text-amber-800">{w}</p>
                                </div>
                            ))}
                            {validation.issues.map(({ tab, items }) => (
                                <div key={tab}>
                                    <p className="text-xs font-semibold">{tab}</p>
                                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                        {items.map(item => (
                                            <li key={item} className="text-xs text-muted-foreground">{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setPreCheckOpen(false)}>
                            Go Back and Fix
                        </Button>
                        <Button onClick={handleProceedAnyway}>
                            Proceed Anyway
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Main PDF generation dialog */}
            <Dialog open={isOpen} onOpenChange={(open) => {
                if (!open && isGeneratingRef.current) {
                    setShowOuterCloseConfirm(true);
                    return;
                }
                setIsOpen(open);
            }}>
                {isOpen && <PdfGenerationDialogContent onClose={() => setIsOpen(false)} onGeneratingChange={handleGeneratingChange} />}
            </Dialog>

            <AlertDialog open={showOuterCloseConfirm} onOpenChange={setShowOuterCloseConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>PDF Generation in Progress</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action will terminate the PDF generation process. Continue?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowOuterCloseConfirm(false)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setShowOuterCloseConfirm(false); setIsOpen(false); }}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

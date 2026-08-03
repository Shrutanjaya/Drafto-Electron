
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
import { ScrollArea } from "../ui/scroll-area";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { getIaList } from "@/lib/ia-list-utils";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useEntitlement } from "@/providers/entitlement-provider";
import { generatePdf } from "@/lib/actions";
import { getSettings } from "./settings-dialog";
import { incrementGenerationCount } from "@/lib/firebase/usage-service";
import { Upload, Loader2, Info, Lock, CheckCircle2, AlertCircle, Settings2, AlertTriangle, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { pickFile } from "@/lib/utils/pick-file";
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
    const basicIssues: string[] = [];
    (data.impugnedOrders || []).forEach((order, i) => {
        const suffix = (data.impugnedOrders || []).length > 1 ? ` ${i + 1}` : '';
        if (!order.caseNumber?.trim()) basicIssues.push(`Impugned Order${suffix}: Case Number`);
        if (!order.effect?.trim()) basicIssues.push(`Impugned Order${suffix}: HC Action`);
    });
    if (!data.advocate?.aorName?.trim()) basicIssues.push('Advocates: AoR Name');
    if (!data.advocate?.aorCode?.trim()) basicIssues.push('Advocates: AoR Code');
    if (!data.deponent?.name?.trim()) basicIssues.push('Deponent: Name');
    if (!data.deponent?.fatherName?.trim()) basicIssues.push("Deponent: Parent's/Husband's Name");
    if (!data.deponent?.age?.trim()) basicIssues.push('Deponent: Age');
    if (!data.deponent?.address?.trim()) basicIssues.push('Deponent: Address');
    if (basicIssues.length) issues.push({ tab: 'Basic Info', items: basicIssues });

    // SLP
    const slpIssues: string[] = [];
    if (!(data.listOfDates || []).some(r => r.event?.trim())) slpIssues.push('List of Dates table is empty');
    if (!(data.questionsOfLaw || []).some(r => r.particulars?.trim())) slpIssues.push('Questions of Law table is empty');
    if (!(data.grounds || []).some(r => r.particulars?.trim())) slpIssues.push('Grounds table is empty');
    if (!data.synopsis?.trim()) slpIssues.push('Synopsis is blank');
    if (slpIssues.length) issues.push({ tab: 'SLP', items: slpIssues });

    // IAs
    const iaIssues: string[] = [];
    if (data.standardIas?.condonationOfDelay?.active) {
        if (!(data.standardIas.condonationOfDelay.grounds || []).some(g => g.particulars?.trim()))
            iaIssues.push('Condonation of Delay: Grounds table is empty');
    }
    if (data.standardIas?.exemptionFromSurrendering?.active) {
        if (!(data.standardIas.exemptionFromSurrendering.grounds || []).some(g => g.particulars?.trim()))
            iaIssues.push('Exemption from Surrendering: Grounds table is empty');
    }
    (data.customIas || []).forEach(ia => {
        if (!(ia.grounds || []).some(g => g.particulars?.trim()))
            iaIssues.push(`${ia.title?.trim() || 'Custom IA'}: Grounds table is empty`);
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
        if (value !== undefined && !value.trim()) lpIssues.push(label);
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

function PdfGenerationDialogContent({ onClose, onGeneratingChange }: { onClose: () => void; onGeneratingChange?: (v: boolean) => void }) {
    const mainForm = useFormContext<DraftoProject>();
    const { toast } = useToast();
    const { entitlement, loading: entLoading, openManageSubscription } = useEntitlement();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showCriminalDocWarning, setShowCriminalDocWarning] = useState(false);
    const pendingSubmitData = useRef<PdfMergeForm | null>(null);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState<string>("");
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ annexures: true });
    const cancelledRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isProcessingOcr, setIsProcessingOcr] = useState(false);
    const [enableOcr, setEnableOcr] = useState(false);
    const isMac = window.electron?.platform === 'darwin';
    const [activeUploadIndex, setActiveUploadIndex] = useState<number | null>(null);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const mainFormValues = useWatch({ control: mainForm.control });
    
    const componentList = useMemo(() => {
        const projectData = mainFormValues;
        const list: Omit<MergeItem, 'userFile' | 'useSystem'>[] = [];

        list.push({ id: 'advocateChecklist', label: "Advocate's Checklist" });
        list.push({ id: 'ci', label: "Cover Page and Index" });
        list.push({ id: 'or', label: "Office Report" });
        list.push({ id: 'lp', label: "Listing Proforma" });
        list.push({ id: 'slod', label: "Synopsis and List of Dates" });

        (projectData.impugnedOrders || []).forEach((order, index) => {
            list.push({ id: `impugnedOrder_${order.id}`, label: `Impugned Order ${index + 1}` });
        });

        list.push({ id: 'slp', label: "SLP with Certificate" });
        list.push({ id: 'slpAffidavit', label: "SLP Affidavit (Executed)" });

        if (projectData.wantsAppendix) {
            list.push({ id: 'appendix', label: "Appendix" });
        }
        
        const allAnnexures: (Annexure & {lodId: string})[] = (projectData.listOfDates || []).flatMap(lod => (lod.annexures || []).map(a => ({...a, lodId: lod.id})));
        
        const annexureNumberingMap = new Map<string, number>();
        let pCounter = 1;
        const nonAdAnnexures = allAnnexures.filter(a => !a.isAdditionalDocument);
        const adAnnexures = allAnnexures.filter(a => a.isAdditionalDocument);

        nonAdAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));
        adAnnexures.forEach(a => annexureNumberingMap.set(a.id, pCounter++));

        // Collect IA ground annexures
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
        
        const processAnnexures = (annexures: (Annexure & {lodId: string})[]) => {
            annexures.forEach(a => {
                const pNum = annexureNumberingMap.get(a.id);
                list.push({ id: `annexure_${a.id}`, label: `Annexure P-${pNum}: ${capitalize(a.title)}${annexDate(a.date)}` });

                if (a.copyType === "true and typed copy" || a.copyType === "true and translated copy") {
                    const typeLabel = a.copyType.includes('typed') ? 'Typed' : 'Translated';
                    list.push({ id: `annexure_${a.id}_typed`, label: `Annexure P-${pNum}: ${capitalize(a.title)}${annexDate(a.date)} (${typeLabel} Copy)` });
                }
            });
        };

        processAnnexures(nonAdAnnexures);
        
        const ias = getIaList(projectData as DraftoProject);
        
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
                 list.push({ id: `ia_annexure_${a.id}`, label: `Annexure A-${aNum}: ${capitalize(a.title)}${annexDate(a.date)}` });
             });
             
             if (ia.id === 'additionalDocuments') {
                 processAnnexures(adAnnexures);
             }
        });

        // Custody Certificate and FIR Details are required for Criminal SLPs (optional to attach)
        if (projectData.caseType === 'Criminal') {
            list.push({ id: 'custodyCertificate', label: 'Custody Certificate' });
            list.push({ id: 'firDetails', label: 'FIR Details' });
        }

        list.push({ id: 'memoOfParties', label: 'Memo of Parties' });
        list.push({ id: 'filingMemo', label: 'Filing Memo' });
        list.push({ id: 'vakalatnama', label: 'Vakalatnama(s)' });

        return list;
    }, [mainFormValues]);

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
                
                const allAnnexures = mainForm.getValues('listOfDates').flatMap(l => l.annexures || []);
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
            if (c.id === 'custodyCertificate' || c.id === 'firDetails') {
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

            // For appendix, always use current file from main form
            if (c.id === 'appendix') {
                const useManual = mainForm.getValues('useManualAppendix');
                const appendixFile = mainForm.getValues('appendixFile');
                let prePopulatedFile: File | null = null;
                
                // Only use the file if not using manual entry
                if (!useManual && appendixFile instanceof File) {
                    prePopulatedFile = appendixFile;
                }
                
                return {
                    ...c,
                    // Manual entry: let the system generate it from the typed text.
                    // File upload: user provides the file.
                    useSystem: !!useManual,
                    userFile: prePopulatedFile,
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
            const lods = mainForm.getValues('listOfDates') || [];
            mainForm.setValue(
                'listOfDates',
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
        } else if (itemId === 'appendix') {
            mainForm.setValue('appendixFile', file, { shouldDirty: true });
            mainForm.setValue('useManualAppendix', false, { shouldDirty: true });
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
        return data.mergeItems
            .filter(item => {
                // IA Affidavits are optional in all SLPs.
                if (isOptionalUpload(item.id)) return true;
                // Custody Certificate / FIR Details are optional in Criminal SLPs.
                return isCriminal && ['custodyCertificate', 'firDetails'].includes(item.id);
            })
            .filter(item => !(item.userFile instanceof File))
            .map(item => item.label);
    };

    const onSubmit = async (data: PdfMergeForm) => {
        // Entitlement gate: paper-book generation requires an active subscription.
        if (entLoading || !entitlement.canExport) {
            toast({
                variant: "destructive",
                title: "Subscription required",
                description:
                    "Paper-book generation is disabled because your subscription isn’t active. Renew to continue.",
                action: (
                    <ToastAction altText="Renew" onClick={openManageSubscription}>
                        Renew
                    </ToastAction>
                ),
            });
            return;
        }

        // Warn if optional docs (IA affidavits, custody/FIR) are missing, but allow proceeding
        const missingOptional = getMissingOptionalDocs(data);
        if (missingOptional.length > 0 && !pendingSubmitData.current) {
            pendingSubmitData.current = data;
            setShowCriminalDocWarning(true);
            return;
        }
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
                                const dir = savedPath.replace(/[\\/][^\\/]+$/, '');
                                window.electron.openFolderPath?.(dir);
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
                            const dir = savedPath.replace(/[\\/][^\\/]+$/, '');
                            window.electron.openFolderPath?.(dir);
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
        
                if (item.id === 'appendix') {
                    if (mainForm.getValues('useManualAppendix')) return false;
                    const appendixFile = mainForm.getValues('appendixFile');
                    return !(appendixFile instanceof File);
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
    const isGoButtonDisabled = isGenerating || missingUploads.length > 0;

    // ── Grouping + per-section readiness (kept in sync with the header by reusing
    // the same missing-upload computations) ──
    const sectionForId = (id: string): { key: string; label: string } => {
        if (id.startsWith('annexure_')) return { key: 'annexures', label: 'Annexures' };
        if (id === 'custodyCertificate' || id === 'firDetails' || id.startsWith('ia_')) return { key: 'ias', label: 'Applications (IAs)' };
        return { key: 'court', label: 'Petition & Court Documents' };
    };
    const optionalMissing = getMissingOptionalDocs({ mergeItems: watchedItems });
    const mandatoryMissingSet = new Set(missingUploads);
    const optionalMissingSet = new Set(optionalMissing);
    const itemStatus = (it: MergeItem): 'ready' | 'mandatory' | 'optional' =>
        mandatoryMissingSet.has(it.label) ? 'mandatory' : optionalMissingSet.has(it.label) ? 'optional' : 'ready';
    // Build ordered sections (preserving merge order — items are already in
    // paperbook order, so this only inserts headers, never reorders). Rows are
    // either an upload (a merge item) or a non-upload requirement.
    type ListRow =
        | { kind: 'item'; item: MergeItem; index: number }
        | { kind: 'requirement'; req: DataRequirement };
    const sections: { key: string; label: string; status: 'ready' | 'mandatory' | 'optional'; rows: ListRow[] }[] = [];
    watchedItems.forEach((item, index) => {
        if (!item) return;
        const { key, label } = sectionForId(item.id);
        let sec = sections.find((s) => s.key === key);
        if (!sec) { sec = { key, label, status: 'ready', rows: [] }; sections.push(sec); }
        sec.rows.push({ kind: 'item', item, index });
    });
    // Slot each non-upload requirement directly under the row it belongs to.
    dataRequirements.forEach((req) => {
        const sec = sections.find((s) => s.key === req.sectionKey);
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

        if (item.id === 'appendix') {
            const useManual = mainForm.getValues('useManualAppendix');
            const manualEntry = mainForm.getValues('appendixManualEntry');
            const appendixFile = mainForm.getValues('appendixFile');
            
            if (useManual) {
                // User chose manual entry
                return manualEntry && manualEntry.trim() ? 'Manual Entry' : 'Upload Required';
            } else {
                // User chose PDF upload
                return (appendixFile instanceof File) ? appendixFile.name : 'Upload Required';
            }
        }

        if (item.id === 'certified_copy_receipt') {
            const receiptFile = mainForm.getValues('standardIas.exemptionCertifiedCopy.receiptFile');
            return receiptFile instanceof File ? receiptFile.name : 'Upload Required';
        }

        return "Upload Required";
    };
    
    const GoButtonWrapper = ({ children }: { children: React.ReactNode }) => {
        if (isGoButtonDisabled && missingUploads.length > 0) {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                           <span tabIndex={0}>{children}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div className="text-xs">
                                <p className="font-bold">The following mandatory items are missing:</p>
                                <ul className="list-disc pl-4">
                                    {missingUploads.map(label => <li key={label}>{label}</li>)}
                                </ul>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }
        return <>{children}</>;
    };

    return (
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Generate Full PDF Paper Book</DialogTitle>
                <DialogDescription>
                    Gray items are system-generated (click any to override with your own file), red items need your upload, yellow are optional. The final PDF is merged in the order below.
                </DialogDescription>
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

            <FormProvider {...uploadForm}>
                <form onSubmit={handleSubmit(onSubmit)} id="pdf-upload-form">
                    <ScrollArea className="h-[60vh] pr-4">
                       <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px] text-xs">S.No.</TableHead>
                                    <TableHead className="text-xs">Component</TableHead>
                                    <TableHead className="w-[200px] text-center text-xs">Source</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sections.map((sec) => {
                                  const collapsed = !!collapsedSections[sec.key];
                                  return (
                                    <React.Fragment key={sec.key}>
                                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableCell colSpan={3} className="py-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setCollapsedSections((p) => ({ ...p, [sec.key]: !p[sec.key] }))}
                                            className="flex w-full items-center justify-between gap-2 text-left"
                                          >
                                            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")} />
                                              {sec.label}
                                              <span className="font-normal normal-case text-muted-foreground/60">({sec.rows.length})</span>
                                            </span>
                                            <StatusChip status={sec.status} />
                                          </button>
                                        </TableCell>
                                      </TableRow>
                                      {!collapsed && sec.rows.map((row) => {
                                    // Non-upload requirement (e.g. the receipt date): shown as a
                                    // row so it can't block generation invisibly, with a pointer
                                    // to the tab where it's filled in.
                                    if (row.kind === 'requirement') {
                                        const req = row.req;
                                        return (
                                            <TableRow key={req.id}>
                                                <TableCell className="text-xs text-muted-foreground">—</TableCell>
                                                <TableCell className="text-xs">{req.label}</TableCell>
                                                <TableCell className="text-center">
                                                    {req.value ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400">
                                                            <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                                                            {req.value}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
                                                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                                            {req.fix}
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }

                                    const { item, index } = row;
                                    const currentItem = item;

                                    const isLocked = isLockedId(currentItem.id);
                                    const hasFile = currentItem.userFile instanceof File;
                                    const isSystemMode = currentItem.useSystem;
                                    const isOptionalCriminal = currentItem.id === 'custodyCertificate' || currentItem.id === 'firDetails';
                                    // Optional uploads share the same (yellow) treatment: Custody/FIR in
                                    // Criminal SLPs, plus IA Affidavits in every SLP.
                                    const isOptional = isOptionalCriminal || isOptionalUpload(currentItem.id);
                                    const lockedTooltip = currentItem.id === 'ci'
                                        ? 'Cover page & index contains auto-calculated page numbers; cannot be replaced'
                                        : currentItem.id === 'slod'
                                        ? 'Synopsis & list of dates contains auto-embedded annexure references; cannot be replaced'
                                        : 'This IA is system-generated and cannot be replaced';

                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="text-xs">{index + 1}</TableCell>
                                            <TableCell className="text-xs">{item.label}</TableCell>
                                            <TableCell className="text-center">
                                                {isLocked ? (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed">
                                                                    <Lock className="h-3 w-3 flex-shrink-0" />
                                                                    Auto-Generated
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-[220px] text-xs">{lockedTooltip}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                ) : hasFile ? (
                                                    <div className="inline-flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => triggerFileUpload(index)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 cursor-pointer max-w-[180px]"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                                                            <span className="truncate">{currentItem.userFile!.name}</span>
                                                        </button>
                                                        {isOptional && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveFile(index)}
                                                                title="Remove file"
                                                                aria-label="Remove file"
                                                                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 cursor-pointer"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : isSystemMode ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => triggerFileUpload(index)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-gray-400/40 dark:border-gray-500/40 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                                                    >
                                                        <Settings2 className="h-3 w-3 flex-shrink-0" />
                                                        System Generated
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => triggerFileUpload(index)}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer",
                                                            isOptional
                                                                ? "border border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20"
                                                                : "border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                                                        )}
                                                    >
                                                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                                        Upload Required
                                                    </button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                      })}
                                    </React.Fragment>
                                  );
                                })}
                                 {watchedItems.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No components to display.</TableCell></TableRow>}
                            </TableBody>
                       </Table>
                    </ScrollArea>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf"
                        onChange={handleFileChange}
                    />
                </form>
                <div className="mt-4 border-t pt-3 space-y-1.5">
                    <div className="flex items-start space-x-2">
                        <Checkbox
                            id="enable-ocr"
                            checked={enableOcr}
                            onCheckedChange={(checked) => setEnableOcr(checked as boolean)}
                            disabled={isGenerating || isMac}
                            className="mt-0.5"
                        />
                        <label htmlFor="enable-ocr" className="text-xs leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            <span className="font-medium">Run OCR on the merged PDF</span>
                            <span className="block text-[11px] text-muted-foreground">
                                {isMac
                                    ? "Unavailable on macOS — generate on Windows to make scanned pages text-searchable."
                                    : "Makes scanned/image pages text-searchable. Use only if your uploads include scanned documents — it takes much longer."}
                            </span>
                        </label>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Large paper books are split into separate volumes automatically (configurable in Settings → Paperbook).
                    </p>
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
            {/* Warning for missing optional Criminal SLP documents */}
            <AlertDialog open={showCriminalDocWarning} onOpenChange={setShowCriminalDocWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Missing Optional Documents</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs">
                            The following documents have not been attached. They are optional — you can proceed without them:
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                        {pendingSubmitData.current && getMissingOptionalDocs(pendingSubmitData.current).map(label => (
                            <li key={label}>{label}</li>
                        ))}
                    </ul>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setShowCriminalDocWarning(false); pendingSubmitData.current = null; }}>
                            Go Back
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                            setShowCriminalDocWarning(false);
                            if (pendingSubmitData.current) onSubmit(pendingSubmitData.current);
                        }}>
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

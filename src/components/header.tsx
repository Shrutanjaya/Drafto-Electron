import React, { useRef, useTransition, useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FolderOpen,
  Save,
  FilePlus,
  Undo,
  Redo,
  FileDown,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { saveAs } from "file-saver";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DraftoProject } from "@/lib/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { generateCiDocx, generateOrDocx, generateCiorDocx, generateLpDocx, generateSlodDocx, generateSlpDocx, generatePdf, generateAppendixDocx, generateIaDocx, generateFilingMemoDocx, generateVakalatnamaDocx, generateAffidavitsDocx, generateAdvocateChecklistDocx } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { draftoProjectSchema } from "@/lib/schema";
import { PdfGenerationDialog } from "./dialogs/pdf-generation-dialog";
import { LoadProjectDialog } from "./dialogs/load-project-dialog";
import { SettingsDialog, getSettings } from "./dialogs/settings-dialog";
import { getIaList } from "@/lib/ia-list-utils";
import { useAuthContext } from "@/providers/auth-provider";

interface HeaderProps {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

type DocType = "ci" | "or" | "cior" | "lp" | "slod" | "slp" | "pdf" | "ia" | "filingMemo" | "appendix" | "vakalatnama" | "advocateChecklist";

const draftOptions = [
    { id: 'ci', label: 'Cover Page and Index' },
    { id: 'or', label: 'Office Report' },
    { id: 'advocateChecklist', label: 'Advocate\'s Checklist' },
    { id: 'lp', label: 'Listing Proforma' },
    { id: 'slod', label: 'Synopsis and List of Dates' },
    { id: 'slp', label: 'SLP with Certificate' },
    { id: 'appendix', label: 'Appendix' },
    { id: 'ias', label: 'IAs' },
    { id: 'filingMemo', label: 'Filing Memo' },
] as const;

type DraftSelection = Record<typeof draftOptions[number]['id'], boolean>;

export function Header({ undo, redo, canUndo, canRedo }: HeaderProps) {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();
  const { user, signOut } = useAuthContext();
  const [isPending, startTransition] = useTransition();
  const [draftSelection, setDraftSelection] = useState<DraftSelection>(
    draftOptions.reduce((acc, opt) => ({ ...acc, [opt.id]: false }), {} as DraftSelection)
  );
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Ctrl+S keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep a ref to handleSave so the autosave interval always calls the latest version
  // (initialized with a no-op; updated immediately via the effect below once handleSave is in scope)
  const handleSaveRef = useRef<() => void>(() => {});

  // Autosave: fires every second and triggers a save once the configured interval elapses
  useEffect(() => {
    let elapsed = 0;
    const tick = setInterval(() => {
      elapsed += 1;
      const { autosaveInterval } = getSettings();
      if (autosaveInterval > 0 && elapsed >= autosaveInterval) {
        elapsed = 0;
        handleSaveRef.current();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  
  // Helper function to extract file paths from File objects for Electron
  const extractFilePaths = async (data: any): Promise<any> => {
    if (!window.electron?.getFilePath) {
      // Not in Electron, return data as-is
      return data;
    }

    const processedData = JSON.parse(JSON.stringify(data, (key, value) => {
      // Replace File objects with null during stringify - we'll handle them separately
      if (value instanceof File) {
        return null;
      }
      return value;
    }));

    // Process listOfDates annexures
    if (data.listOfDates && Array.isArray(data.listOfDates)) {
      for (let i = 0; i < data.listOfDates.length; i++) {
        const lod = data.listOfDates[i];
        if (lod.annexures && Array.isArray(lod.annexures)) {
          for (let j = 0; j < lod.annexures.length; j++) {
            const annex = lod.annexures[j];
            if (annex.file instanceof File) {
              try {
                const path = await window.electron!.getFilePath(annex.file);
                if (processedData.listOfDates?.[i]?.annexures?.[j]) {
                  processedData.listOfDates[i].annexures[j].filePath = path;
                }
              } catch (err) {
                console.warn(`Could not extract path for file: ${annex.file.name}`, err);
              }
            }
            if (annex.typedOrTranslatedFile instanceof File) {
              try {
                const path = await window.electron!.getFilePath(annex.typedOrTranslatedFile);
                if (processedData.listOfDates?.[i]?.annexures?.[j]) {
                  processedData.listOfDates[i].annexures[j].typedOrTranslatedFilePath = path;
                }
              } catch (err) {
                console.warn(`Could not extract path for typed/translated file: ${annex.typedOrTranslatedFile.name}`, err);
              }
            }
          }
        }
      }
    }

    // Process IA annexures
    const processIaAnnexures = async (iaList: any[]) => {
      if (!iaList || !Array.isArray(iaList)) return;
      
      for (let i = 0; i < iaList.length; i++) {
        const ia = iaList[i];
        if (ia.grounds && Array.isArray(ia.grounds)) {
          for (let j = 0; j < ia.grounds.length; j++) {
            const ground = ia.grounds[j];
            if (ground.annexures && Array.isArray(ground.annexures)) {
              for (let k = 0; k < ground.annexures.length; k++) {
                const annex = ground.annexures[k];
                if (annex.file instanceof File) {
                  try {
                    const path = await window.electron!.getFilePath(annex.file);
                    if (processedData[iaList === data.customIas ? 'customIas' : '']?.[i]?.grounds?.[j]?.annexures?.[k]) {
                      const target = iaList === data.customIas ? processedData.customIas : processedData;
                      if (target[i]?.grounds?.[j]?.annexures?.[k]) {
                        target[i].grounds[j].annexures[k].filePath = path;
                      }
                    }
                  } catch (err) {
                    console.warn(`Could not extract path for IA file: ${annex.file.name}`, err);
                  }
                }
              }
            }
          }
        }
      }
    };

    await processIaAnnexures(data.customIas);

    // Process standardIas annexures
    if (data.standardIas) {
      // Process condonationOfDelay grounds
      if (data.standardIas.condonationOfDelay?.grounds && Array.isArray(data.standardIas.condonationOfDelay.grounds)) {
        for (let i = 0; i < data.standardIas.condonationOfDelay.grounds.length; i++) {
          const ground = data.standardIas.condonationOfDelay.grounds[i];
          if (ground.annexures && Array.isArray(ground.annexures)) {
            for (let j = 0; j < ground.annexures.length; j++) {
              const annex = ground.annexures[j];
              if (annex.file instanceof File) {
                try {
                  const path = await window.electron!.getFilePath(annex.file);
                  if (processedData.standardIas?.condonationOfDelay?.grounds?.[i]?.annexures?.[j]) {
                    processedData.standardIas.condonationOfDelay.grounds[i].annexures[j].typedOrTranslatedFilePath = path;
                  }
                } catch (err) {
                  console.warn(`Could not extract path for condonation IA file: ${annex.file.name}`, err);
                }
              }
            }
          }
        }
      }
      
      // Process exemptionFromSurrendering grounds
      if (data.standardIas.exemptionFromSurrendering?.grounds && Array.isArray(data.standardIas.exemptionFromSurrendering.grounds)) {
        for (let i = 0; i < data.standardIas.exemptionFromSurrendering.grounds.length; i++) {
          const ground = data.standardIas.exemptionFromSurrendering.grounds[i];
          if (ground.annexures && Array.isArray(ground.annexures)) {
            for (let j = 0; j < ground.annexures.length; j++) {
              const annex = ground.annexures[j];
              if (annex.file instanceof File) {
                try {
                  const path = await window.electron!.getFilePath(annex.file);
                  if (processedData.standardIas?.exemptionFromSurrendering?.grounds?.[i]?.annexures?.[j]) {
                    processedData.standardIas.exemptionFromSurrendering.grounds[i].annexures[j].typedOrTranslatedFilePath = path;
                  }
                } catch (err) {
                  console.warn(`Could not extract path for exemption IA file: ${annex.file.name}`, err);
                }
              }
            }
          }
        }
      }
    }

    // Process PDF merge items
    if (data.pdfMergeItems && Array.isArray(data.pdfMergeItems)) {
      for (let i = 0; i < data.pdfMergeItems.length; i++) {
        const item = data.pdfMergeItems[i];
        if (item.userFile instanceof File) {
          try {
            const path = await window.electron!.getFilePath(item.userFile);
            if (processedData.pdfMergeItems?.[i]) {
              processedData.pdfMergeItems[i].userFilePath = path;
            }
          } catch (err) {
            console.warn(`Could not extract path for PDF merge file: ${item.userFile.name}`, err);
          }
        }
      }
    }

    // Process Appendix file
    if (data.appendixFile instanceof File) {
      try {
        const path = await window.electron!.getFilePath(data.appendixFile);
        processedData.appendixFilePath = path;
      } catch (err) {
        console.warn(`Could not extract path for appendix file: ${data.appendixFile.name}`, err);
      }
    }

    // Process Certified Copy receipt file
    if (data.standardIas?.exemptionCertifiedCopy?.receiptFile instanceof File) {
      try {
        const path = await window.electron!.getFilePath(data.standardIas.exemptionCertifiedCopy.receiptFile);
        if (processedData.standardIas?.exemptionCertifiedCopy) {
          processedData.standardIas.exemptionCertifiedCopy.receiptFilePath = path;
        }
      } catch (err) {
        console.warn(`Could not extract path for certified copy receipt file: ${data.standardIas.exemptionCertifiedCopy.receiptFile.name}`, err);
      }
    }

    return processedData;
  };
  
  const handleSave = async () => {
    const data = form.getValues();
    const petitioners = data.petitioners;
    const petitionerName =
      !petitioners || petitioners.length === 0 || !petitioners[0]?.name
        ? "Untitled"
        : petitioners[0].name.replace(/\s+/g, "_").slice(0, 10);

    // Extract file paths (Electron only)
    const dataWithPaths = await extractFilePaths(data);
    const jsonString = JSON.stringify(dataWithPaths, null, 2);

    // Try Electron first; fall back to browser download
    try {
      if (typeof window !== "undefined" && window.electron?.saveProject) {
        const savedPath = await window.electron.saveProject({
          petitionerName,
          content: jsonString,
        });
        toast({ variant: "success", title: "Saved" });
        return;
      }
    } catch (err) {
      console.error("Electron save failed, falling back to download:", err);
    }

    const blob = new Blob([jsonString], { type: "application/json" });
    saveAs(blob, `${petitionerName}.drafto`);
    toast({ variant: "success", title: "Saved" });
  };

  // Keep the ref current so the autosave interval always calls the latest handleSave closure
  useEffect(() => { handleSaveRef.current = handleSave; });

  const handleLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          
          // If running in Electron, restore File objects from saved paths
          if (window.electron?.createFileFromPath) {
            await restoreFilesFromPaths(data);
          }
          
          const validatedData = draftoProjectSchema.parse(data);
          form.reset(validatedData);
          
          toast({ title: "Project Loaded", description: "Your project has been loaded successfully." });
        } catch (error) {
          console.error("Load error:", error);
          toast({ variant: "destructive", title: "Load Failed", description: "The selected file is not a valid .drafto project." });
        } finally {
          // allow reloading the same file again
          if (event.target) event.target.value = "";
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLoadFromDialog = async (content: string) => {
    try {
      const data = JSON.parse(content);
      
      // If running in Electron, restore File objects from saved paths
      if (window.electron?.createFileFromPath) {
        await restoreFilesFromPaths(data);
      }
      
      const validatedData = draftoProjectSchema.parse(data);
      form.reset(validatedData);
    } catch (error) {
      console.error("Load error:", error);
      toast({ variant: "destructive", title: "Load Failed", description: "The selected file is not a valid .drafto project." });
    }
  };

  // Helper function to restore File objects from saved paths (Electron only)
  const restoreFilesFromPaths = async (data: any) => {
    if (!window.electron?.createFileFromPath) {
      return;
    }

    // Restore listOfDates annexures
    if (data.listOfDates && Array.isArray(data.listOfDates)) {
      for (let i = 0; i < data.listOfDates.length; i++) {
        const lod = data.listOfDates[i];
        if (lod.annexures && Array.isArray(lod.annexures)) {
          for (let j = 0; j < lod.annexures.length; j++) {
            const annex = lod.annexures[j];
            
            if (annex.filePath && !(annex.file instanceof File)) {
              try {
                annex.file = await window.electron.createFileFromPath(annex.filePath);
              } catch (err) {
                console.warn(`Could not restore file from path: ${annex.filePath}`, err);
                toast({ 
                  variant: "destructive", 
                  title: "File Not Found", 
                  description: `Could not find: ${annex.filePath.split('\\').pop() || annex.filePath.split('/').pop()}` 
                });
              }
            }
            if (annex.typedOrTranslatedFilePath && !annex.typedOrTranslatedFile) {
              try {
                console.log(`🔄 [RESTORE] Restoring typed/translated file from: ${annex.typedOrTranslatedFilePath}`);
                annex.typedOrTranslatedFile = await window.electron.createFileFromPath(annex.typedOrTranslatedFilePath);
                console.log(`🔄 [RESTORE] ✅ Typed/translated file restored`);
              } catch (err) {
                console.warn(`🔄 [RESTORE] ❌ Could not restore typed/translated file from path: ${annex.typedOrTranslatedFilePath}`, err);
              }
            }
          }
        }
      }
    }

    // Restore IA annexures (customIas)
    if (data.customIas && Array.isArray(data.customIas)) {
      for (const ia of data.customIas) {
        if (ia.grounds && Array.isArray(ia.grounds)) {
          for (const ground of ia.grounds) {
            if (ground.annexures && Array.isArray(ground.annexures)) {
              for (const annex of ground.annexures) {
                if (annex.filePath && !(annex.file instanceof File)) {
                  try {
                    annex.file = await window.electron.createFileFromPath(annex.filePath);
                  } catch (err) {
                    console.warn(`Could not restore custom IA file from path: ${annex.filePath}`, err);
                    toast({ 
                      variant: "destructive", 
                      title: "File Not Found", 
                      description: `Could not find: ${annex.filePath.split('\\').pop() || annex.filePath.split('/').pop()}` 
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Restore standardIas annexures
    if (data.standardIas) {
      
      // Process condonationOfDelay grounds
      if (data.standardIas.condonationOfDelay?.grounds && Array.isArray(data.standardIas.condonationOfDelay.grounds)) {
        for (const ground of data.standardIas.condonationOfDelay.grounds) {
          if (ground.annexures && Array.isArray(ground.annexures)) {
            for (const annex of ground.annexures) {
              if (annex.typedOrTranslatedFilePath && !(annex.file instanceof File)) {
                try {
                  annex.file = await window.electron.createFileFromPath(annex.typedOrTranslatedFilePath);
                } catch (err) {
                  console.warn(`Could not restore condonation IA file from path: ${annex.typedOrTranslatedFilePath}`, err);
                  toast({ 
                    variant: "destructive", 
                    title: "File Not Found", 
                    description: `Could not find: ${annex.typedOrTranslatedFilePath.split('\\').pop() || annex.typedOrTranslatedFilePath.split('/').pop()}` 
                  });
                }
              }
            }
          }
        }
      }
      
      // Process exemptionFromSurrendering grounds
      if (data.standardIas.exemptionFromSurrendering?.grounds && Array.isArray(data.standardIas.exemptionFromSurrendering.grounds)) {
        for (const ground of data.standardIas.exemptionFromSurrendering.grounds) {
          if (ground.annexures && Array.isArray(ground.annexures)) {
            for (const annex of ground.annexures) {
              if (annex.typedOrTranslatedFilePath && !(annex.file instanceof File)) {
                try {
                  annex.file = await window.electron.createFileFromPath(annex.typedOrTranslatedFilePath);
                } catch (err) {
                  console.warn(`Could not restore exemption IA file from path: ${annex.typedOrTranslatedFilePath}`, err);
                  toast({ 
                    variant: "destructive", 
                    title: "File Not Found", 
                    description: `Could not find: ${annex.typedOrTranslatedFilePath.split('\\').pop() || annex.typedOrTranslatedFilePath.split('/').pop()}` 
                  });
                }
              }
            }
          }
        }
      }
    }
    
    // Process PDF merge items
    if (data.pdfMergeItems && Array.isArray(data.pdfMergeItems)) {
      for (const item of data.pdfMergeItems) {
        if (item.userFilePath && !(item.userFile instanceof File)) {
          try {
            item.userFile = await window.electron.createFileFromPath(item.userFilePath);
          } catch (err) {
            console.warn(`Could not restore PDF merge file from path: ${item.userFilePath}`, err);
            toast({ 
              variant: "destructive", 
              title: "File Not Found", 
              description: `Could not find: ${item.userFilePath.split('\\').pop() || item.userFilePath.split('/').pop()}` 
            });
          }
        }
      }
    }

    // Restore Appendix file
    if (data.appendixFilePath && !(data.appendixFile instanceof File)) {
      try {
        data.appendixFile = await window.electron.createFileFromPath(data.appendixFilePath);
      } catch (err) {
        console.warn(`Could not restore appendix file from path: ${data.appendixFilePath}`, err);
        toast({ 
          variant: "destructive", 
          title: "File Not Found", 
          description: `Could not find: ${data.appendixFilePath.split('\\').pop() || data.appendixFilePath.split('/').pop()}` 
        });
      }
    }

    // Restore Certified Copy receipt file
    if (data.standardIas?.exemptionCertifiedCopy?.receiptFilePath && !(data.standardIas.exemptionCertifiedCopy.receiptFile instanceof File)) {
      try {
        data.standardIas.exemptionCertifiedCopy.receiptFile = await window.electron.createFileFromPath(data.standardIas.exemptionCertifiedCopy.receiptFilePath);
      } catch (err) {
        console.warn(`Could not restore certified copy receipt file from path: ${data.standardIas.exemptionCertifiedCopy.receiptFilePath}`, err);
        toast({ 
          variant: "destructive", 
          title: "File Not Found", 
          description: `Could not find: ${data.standardIas.exemptionCertifiedCopy.receiptFilePath.split('\\').pop() || data.standardIas.exemptionCertifiedCopy.receiptFilePath.split('/').pop()}` 
        });
      }
    }
  };

  const handleNew = () => {
    form.reset(draftoProjectSchema.parse({}));
    toast({ title: "New Project", description: "A new blank project has been created." });
  };
  
  const downloadDocx = async (docx: string, fileName: string) => {
    // Try Electron first (with default path)
    try {
      if (typeof window !== "undefined" && window.electron?.saveDocx) {
        const settings = getSettings();
        
        // Get petitioner name for subfolder
        const data = form.getValues();
        const petitioners = data.petitioners;
        const petitionerName =
          !petitioners || petitioners.length === 0 || !petitioners[0]?.name
            ? "Untitled"
            : petitioners[0].name.replace(/\s+/g, "_").slice(0, 30);
        
        const savedPath = await window.electron.saveDocx({
          fileName,
          content: docx,
          defaultPath: settings.defaultDocxPath || undefined,
          projectFolder: petitionerName,
        });
        if (savedPath) {
          toast({ title: "DOCX Generated", description: `Saved to ${savedPath}` });
          return;
        }
      }
    } catch (err) {
      console.error("Electron DOCX save failed, falling back to download:", err);
    }
    
    // Fallback to browser download
    const byteCharacters = atob(docx);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    saveAs(blob, fileName);
    toast({ title: "DOCX Generated", description: `Your document ${fileName} has been downloaded.` });
  };


  const handleExport = (type: DocType, iaDetails?: { identifier: string; customText?: string; }) => {
    startTransition(async () => {
      const data = form.getValues();
      
      if (type === 'pdf') {
         // This is now handled by the PdfGenerationDialog
         return;
      }
      
      let result;
      switch (type) {
        case 'ci':
            result = await generateCiDocx(data);
            break;
        case 'or':
            result = await generateOrDocx(data);
            break;
        case 'cior':
            // Legacy: Generate both CI and OR as one file
            result = await generateCiorDocx(data);
            break;
        case 'advocateChecklist':
            result = await generateAdvocateChecklistDocx(data);
            break;
        case 'lp':
            result = await generateLpDocx(data);
            break;
        case 'slod':
            result = await generateSlodDocx(data);
            break;
        case 'slp':
            result = await generateSlpDocx(data);
            break;
        case 'appendix':
            if (data.wantsAppendix && (data.appendixFile || data.appendixManualEntry)) {
                result = await generateAppendixDocx(data);
            } else {
                toast({ variant: "destructive", title: "Export Skipped", description: "Appendix was not selected or no data was provided." });
                return;
            }
            break;
        case 'filingMemo':
            result = await generateFilingMemoDocx(data);
            break;
        case 'vakalatnama':
            result = await generateVakalatnamaDocx(data);
            break;
        case 'ia':
            if (iaDetails) {
                result = await generateIaDocx(data, iaDetails.identifier, iaDetails.customText);
            }
            break;
        default:
            toast({ variant: "destructive", title: "Export Failed", description: "Invalid document type." });
            return;
      }

      if (result && result.success && result.docx) {
        downloadDocx(result.docx, result.fileName);
      } else if (result && !result.success) {
        toast({ variant: "destructive", title: "Export Failed", description: result.message || "Could not generate DOCX file." });
      }
    });
  };
  
  const handleExportAllIas = () => {
    const data = form.getValues();
    const allIas = getIaList(data);

    allIas.forEach(ia => {
        handleExport("ia", { identifier: ia.id, customText: ia.title });
    });
    
    if (allIas.length > 0) {
        toast({ title: "Exporting IAs", description: "All valid Interlocutory Applications are being generated." });
    } else {
        toast({ variant: "destructive", title: "No IAs to Export", description: "There are no active IAs to export." });
    }
  };
  
  const handleDraftSelectionChange = (id: keyof DraftSelection, checked: boolean) => {
    setDraftSelection(prev => ({ ...prev, [id]: checked }));
  };

  const handleSelectAllDrafts = () => {
    setDraftSelection(
      draftOptions.reduce((acc, opt) => ({ ...acc, [opt.id]: true }), {} as DraftSelection)
    );
  };
  
  const handleClearAllDrafts = () => {
    setDraftSelection(
      draftOptions.reduce((acc, opt) => ({ ...acc, [opt.id]: false }), {} as DraftSelection)
    );
  };

  const handleGenerateDrafts = () => {
    startTransition(() => {
        if (draftSelection.ci) handleExport('ci');
        if (draftSelection.or) handleExport('or');
        if (draftSelection.advocateChecklist) handleExport('advocateChecklist');
        if (draftSelection.lp) handleExport('lp');
        if (draftSelection.slod) handleExport('slod');
        if (draftSelection.slp) handleExport('slp');
        if (draftSelection.appendix) handleExport('appendix');
        if (draftSelection.filingMemo) handleExport('filingMemo');
        if (draftSelection.ias) handleExportAllIas();
    });
  }

  const handleGenerateAffidavitsAndVakalatnama = () => {
    startTransition(async () => {
        const data = form.getValues();

        const affidavitResult = await generateAffidavitsDocx(data);
        if (affidavitResult.success && affidavitResult.documents) {
            affidavitResult.documents.forEach(doc => {
                if (doc.success && doc.docx) {
                    downloadDocx(doc.docx, doc.fileName);
                }
            });
        } else if (!affidavitResult.success) {
            toast({ variant: "destructive", title: "Affidavit Generation Failed", description: affidavitResult.message || "Could not generate affidavit files." });
        }

        const vakalatnamaResult = await generateVakalatnamaDocx(data);
        if (vakalatnamaResult.success && vakalatnamaResult.docx) {
            downloadDocx(vakalatnamaResult.docx, vakalatnamaResult.fileName);
        } else if (!vakalatnamaResult.success) {
            toast({ variant: "destructive", title: "Vakalatnama Generation Failed", description: vakalatnamaResult.message || "Could not generate Vakalatnama." });
        }
    });
  };

  return (
    <header className="flex h-12 items-center justify-between border-b bg-card px-2">
      <div className="flex items-center gap-2">
        <img src="/Drafto Logo.png" alt="Drafto Logo" className="h-7 w-auto" />
        <h1 className="font-headline text-lg font-bold">DraftoSLP</h1>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">File</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={handleNew}><FilePlus className="mr-2" />New Project</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSave}><Save className="mr-2" />Save Project</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => {
              if (window.electron?.listDraftoFiles) {
                setShowLoadDialog(true);
              } else {
                fileInputRef.current?.click();
              }
            }}><FolderOpen className="mr-2" />Load Project</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isPending}>
              {isPending ? 'Exporting...' : 'Docx'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <FileDown className="mr-2" />
                    <span>Drafts</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-2">
                    {draftOptions.map(option => (
                        <DropdownMenuCheckboxItem
                            key={option.id}
                            checked={draftSelection[option.id]}
                            onCheckedChange={(checked) => handleDraftSelectionChange(option.id, !!checked)}
                            onSelect={(e) => e.preventDefault()}
                        >
                            {option.label}
                        </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <div className="flex justify-between gap-1">
                        <Button variant="ghost" size="sm" className="w-full" onClick={handleSelectAllDrafts}>Select All</Button>
                        <Button variant="ghost" size="sm" className="w-full" onClick={handleClearAllDrafts}>Clear All</Button>
                        <Button size="sm" className="w-full" onClick={handleGenerateDrafts}>Done</Button>
                    </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={handleGenerateAffidavitsAndVakalatnama}>
                  <FileDown className="mr-2" />Affidavit(s) and Vakalatnama(s)
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <PdfGenerationDialog>
          <Button variant="ghost" size="sm" disabled={isPending}>PDF</Button>
        </PdfGenerationDialog>

        <ThemeToggle />

        <SettingsDialog>
          <Button variant="ghost" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </SettingsDialog>

        <Button variant="ghost" size="icon" title="Undo" onClick={undo} disabled={!canUndo}><Undo /></Button>
        <Button variant="ghost" size="icon" title="Redo" onClick={redo} disabled={!canRedo}><Redo /></Button>

        <Separator orientation="vertical" className="h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user?.displayName || user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLoad}
        accept=".drafto"
        className="hidden"
      />
      <LoadProjectDialog 
        open={showLoadDialog} 
        onOpenChange={setShowLoadDialog}
        onLoad={handleLoadFromDialog}
      />
    </header>
  );
}


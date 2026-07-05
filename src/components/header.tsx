import React, { useRef, useTransition, useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FolderOpen,
  Save,
  FilePlus,
  Undo,
  Redo,
  FileDown,
  FileText,
  Settings,
  LogOut,
  User,
  Loader2,
} from "lucide-react";
import { saveAs } from "file-saver";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { generateCiDocx, generateOrDocx, generateCiorDocx, generateLpDocx, generateSlodDocx, generateSlpDocx, generatePdf, generateAppendixDocx, generateIaDocx, generateFilingMemoDocx, generateVakalatnamaDocx, generateAffidavitsDocx, generateAdvocateChecklistDocx } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { draftoProjectSchema } from "@/lib/schema";
import { PdfGenerationDialog } from "./dialogs/pdf-generation-dialog";
import { ImportChangesDialog } from "./dialogs/import-changes-dialog";
import { LoadProjectDialog } from "./dialogs/load-project-dialog";
import { SettingsDialog, getSettings } from "./dialogs/settings-dialog";
import { newBlankProject } from "@/lib/project-defaults";
import { getIaList } from "@/lib/ia-list-utils";
import { restoreFileFromPath } from "@/lib/utils/pick-file";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/providers/auth-provider";
import { incrementGenerationCount } from "@/lib/firebase/usage-service";

/** Returns first N words of a string, trimmed. */
const firstWords = (str: string, n: number) =>
  str.trim().split(/\s+/).slice(0, n).join(' ');

/**
 * On load, the advocate's signing dates (Filed by / Drawn on / Settled on) default
 * to "today" for a fresh draft. A saved project carries the date it was last filed,
 * which is almost always stale by the time it is reopened — so any of these dates
 * that falls before today is bumped forward to today. Mutates `data` in place.
 */
const bumpStaleAdvocateDates = (data: any) => {
  const adv = data?.advocate;
  if (!adv) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = { ...adv };
  (['filingDate', 'drawnByDate', 'settledByDate'] as const).forEach((key) => {
    const d = next[key] ? new Date(next[key]) : null;
    if (d && d < today) next[key] = today;
  });
  data.advocate = next;
};

/**
 * Generates a clean file/folder name in the form "Petitioner v. Respondent".
 * Uses up to the first 3 words of each party's name.
 * Falls back gracefully when either side is absent.
 */
export function getProjectFileName(data: { petitioners?: Array<{ name?: string }>; respondents?: Array<{ name?: string }> }): string {
  const petName = data.petitioners?.[0]?.name?.trim();
  const resName = data.respondents?.[0]?.name?.trim();
  const pet = petName ? firstWords(petName, 3) : '';
  const res = resName ? firstWords(resName, 3) : '';
  if (pet && res) return `${pet} v. ${res}`;
  if (pet) return pet;
  if (res) return `v. ${res}`;
  return 'Untitled';
}

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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

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

  // Register global auto-update listeners so we catch updates even when settings dialog is closed
  useEffect(() => {
    if (!window.electron) return;
    // Query persisted state from main process (handles case where update fired before mount)
    window.electron.auGetState?.().then((state: { status: string; version: string | null }) => {
      if (state?.status === 'available' || state?.status === 'downloaded') {
        setUpdateAvailable(true);
        toast({
          title: state.status === 'downloaded' ? 'Update ready to install' : `Update available: v${state.version}`,
          description: 'Open Settings → Support to install.',
        });
      }
    });
    window.electron.onAuUpdateAvailable?.((info: { version: string }) => {
      setUpdateAvailable(true);
      toast({
        title: `Update available: v${info.version}`,
        description: 'Open Settings → Support to download and install.',
      });
    });
    window.electron.onAuUpdateDownloaded?.(() => {
      setUpdateAvailable(true);
      toast({
        title: 'Update ready to install',
        description: 'Open Settings → Support, then click Restart & Install.',
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a stable ref to currentFilePath so the lock-file cleanup doesn't re-register listeners
  const currentFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
    // Expose the saved .drafto path so the AI panel can place split annexures
    // in a managed folder next to it.
    (window as unknown as { __draftoProjectPath?: string | null }).__draftoProjectPath = currentFilePath;
  }, [currentFilePath]);

  // Handle files opened via OS (double-click or second-instance) — register once on mount
  useEffect(() => {
    if (!window.electron?.onOpenFilePath) return;
    window.electron.onOpenFilePath((fp: string) => handleLoadFromPathRef.current(fp));
    const cleanup = () => {
      if (currentFilePathRef.current) window.electron?.deleteLockFile?.(currentFilePathRef.current);
    };
    window.addEventListener('beforeunload', cleanup);
    return () => window.removeEventListener('beforeunload', cleanup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref to handleSave so the autosave interval always calls the latest version
  // (initialized with a no-op; updated immediately via the effect below once handleSave is in scope)
  const handleSaveRef = useRef<() => void>(() => {});
  const handleLoadFromPathRef = useRef<(fp: string) => void>(() => {});

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
  // Reads the .path property that pickFile() attaches to every File object,
  // strips the binary File from the serialised data, and saves the path string.
  const extractFilePaths = (data: any): any => {
    // Deep-clone via JSON, which drops non-serialisable File objects to undefined/null.
    const cloned = JSON.parse(JSON.stringify(data, (_key, value) =>
      value instanceof File ? undefined : value
    ));

    const getPath = (f: any): string | undefined =>
      f instanceof File ? (f as any).path ?? undefined : undefined;

    // listOfDates annexures
    for (let i = 0; i < (data.listOfDates ?? []).length; i++) {
      for (let j = 0; j < (data.listOfDates[i].annexures ?? []).length; j++) {
        const annex = data.listOfDates[i].annexures[j];
        const p = getPath(annex.file);
        if (p) cloned.listOfDates[i].annexures[j].filePath = p;
        const tp = getPath(annex.typedOrTranslatedFile);
        if (tp) cloned.listOfDates[i].annexures[j].typedOrTranslatedFilePath = tp;
      }
    }

    // customIas grounds annexures
    for (let i = 0; i < (data.customIas ?? []).length; i++) {
      for (let j = 0; j < (data.customIas[i].grounds ?? []).length; j++) {
        for (let k = 0; k < (data.customIas[i].grounds[j].annexures ?? []).length; k++) {
          const annex = data.customIas[i].grounds[j].annexures[k];
          const p = getPath(annex.file);
          if (p) cloned.customIas[i].grounds[j].annexures[k].filePath = p;
        }
      }
    }

    // standardIas grounds annexures
    for (const key of ['condonationOfDelay', 'exemptionFromSurrendering'] as const) {
      const grounds = data.standardIas?.[key]?.grounds ?? [];
      for (let i = 0; i < grounds.length; i++) {
        for (let j = 0; j < (grounds[i].annexures ?? []).length; j++) {
          const annex = grounds[i].annexures[j];
          const p = getPath(annex.file);
          if (p) cloned.standardIas[key].grounds[i].annexures[j].filePath = p;
          const tp = getPath(annex.typedOrTranslatedFile);
          if (tp) cloned.standardIas[key].grounds[i].annexures[j].typedOrTranslatedFilePath = tp;
        }
      }
    }

    // PDF merge items
    for (let i = 0; i < (data.pdfMergeItems ?? []).length; i++) {
      const p = getPath(data.pdfMergeItems[i].userFile);
      if (p) cloned.pdfMergeItems[i].userFilePath = p;
    }

    // Appendix
    const ap = getPath(data.appendixFile);
    if (ap) cloned.appendixFilePath = ap;

    // Certified copy receipt
    const rp = getPath(data.standardIas?.exemptionCertifiedCopy?.receiptFile);
    if (rp && cloned.standardIas?.exemptionCertifiedCopy)
      cloned.standardIas.exemptionCertifiedCopy.receiptFilePath = rp;

    return cloned;
  };
  
  const handleSave = async () => {
    const data = form.getValues();
    const petitionerName = getProjectFileName(data);

    // Extract file paths and serialize (File objects are stripped; paths are preserved)
    const dataWithPaths = extractFilePaths(data);
    const jsonString = JSON.stringify(dataWithPaths, null, 2);

    // Shared-path save (overwrite file in-place)
    if (currentFilePath && window.electron?.saveProjectToPath) {
      try {
        await window.electron.saveProjectToPath({ filePath: currentFilePath, content: jsonString });
        toast({ variant: "success", title: "Saved" });
        return;
      } catch (err) {
        console.error("Shared path save failed:", err);
        toast({ variant: "destructive", title: "Save Failed", description: String(err) });
        return;
      }
    }

    // If user has configured a default .drafto folder, save there on first save
    const defaultDraftoPath = getSettings().defaultDraftoPath;
    if (defaultDraftoPath && window.electron?.saveProjectToPath) {
      try {
        const sep = defaultDraftoPath.includes('/') ? '/' : '\\';
        const destPath = `${defaultDraftoPath}${sep}${petitionerName}.drafto`;
        await window.electron.saveProjectToPath({ filePath: destPath, content: jsonString });
        setCurrentFilePath(destPath);
        if (window.electron.writeLockFile) await window.electron.writeLockFile(destPath);
        toast({ variant: "success", title: "Saved" });
        return;
      } catch (err) {
        console.error("Default drafto path save failed, falling back:", err);
      }
    }

    // Local save (userData/projects/)
    try {
      if (typeof window !== "undefined" && window.electron?.saveProject) {
        const savedPath = await window.electron.saveProject({
          petitionerName,
          content: jsonString,
        });
        if (savedPath) setCurrentFilePath(savedPath);
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
  // Keep the ref current so the OS file-open listener always calls the latest handleLoadFromPath
  useEffect(() => { handleLoadFromPathRef.current = handleLoadFromPath; });

  const handleLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          
          // If running in Electron, restore File objects from saved paths
          if (window.electron?.readFileByPath) {
            await restoreFilesFromPaths(data);
          }
          
          const validatedData = draftoProjectSchema.parse(data);
          bumpStaleAdvocateDates(validatedData);
          form.reset(validatedData);
          setCurrentFilePath(null);
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
      if (window.electron?.readFileByPath) {
        await restoreFilesFromPaths(data);
      }
      
      const validatedData = draftoProjectSchema.parse(data);
      bumpStaleAdvocateDates(validatedData);
      form.reset(validatedData);
      // Release lock on any previously open file
      if (currentFilePath && window.electron?.deleteLockFile) {
        await window.electron.deleteLockFile(currentFilePath);
      }
      setCurrentFilePath(null); // loaded from local userData — clear any shared path
    } catch (error) {
      console.error("Load error:", error);
      toast({ variant: "destructive", title: "Load Failed", description: "The selected file is not a valid .drafto project." });
    }
  };

  /**
   * Open a .drafto file from an absolute path.
   * Checks for an advisory lock, loads, restores File objects, resets the form,
   * writes our own lock, and tracks the current file path.
   */
  const handleLoadFromPath = async (filePath: string) => {
    if (!window.electron) return;
    try {
      // Release lock on the previously open file before switching
      if (currentFilePath && currentFilePath !== filePath && window.electron.deleteLockFile) {
        await window.electron.deleteLockFile(currentFilePath);
      }
      // Advisory lock check + write our own lock
      if (window.electron.writeLockFile) {
        const lockResult = await window.electron.writeLockFile(filePath);
        if (lockResult?.locked) {
          const since = lockResult.since ? new Date(lockResult.since).toLocaleTimeString() : 'recently';
          toast({
            variant: "destructive",
            title: "File in Use",
            description: `${lockResult.user} has had this file open since ${since}. You can still open it, but coordinate before saving.`,
          });
          // Proceed anyway — advisory only
        }
      }
      const content = await window.electron.loadProjectFromPath(filePath);
      const data = JSON.parse(content);
      if (window.electron.readFileByPath) await restoreFilesFromPaths(data);
      const validatedData = draftoProjectSchema.parse(data);
      bumpStaleAdvocateDates(validatedData);
      form.reset(validatedData);
      setCurrentFilePath(filePath);
      toast({ title: "Project Loaded", description: filePath.split(/[\\/]/).pop() });
    } catch (err) {
      console.error("Load from path error:", err);
      toast({ variant: "destructive", title: "Load Failed", description: String(err) });
    }
  };

  /** Save project to the configured shared folder and switch to saving there. */
  const handleChangeSaveLocation = async () => {
    if (!window.electron?.selectDirectory || !window.electron?.saveProjectToPath) return;
    const dir = await window.electron.selectDirectory();
    if (!dir) return;
    const data = form.getValues();
    const petitionerName = getProjectFileName(data);
    const sep = dir.includes('/') ? '/' : '\\';
    const destPath = `${dir}${sep}${petitionerName}.drafto`;
    try {
      const dataWithPaths = extractFilePaths(data);
      const jsonString = JSON.stringify(dataWithPaths, null, 2);
      // Remove the old location from recent files before saving to the new one
      if (currentFilePath && window.electron.removeRecentFile) {
        await window.electron.removeRecentFile(currentFilePath);
      }
      // Release the lock on the old file
      if (currentFilePath && window.electron.deleteLockFile) {
        await window.electron.deleteLockFile(currentFilePath);
      }
      await window.electron.saveProjectToPath({ filePath: destPath, content: jsonString });
      setCurrentFilePath(destPath);
      if (window.electron.writeLockFile) await window.electron.writeLockFile(destPath);
      toast({ variant: "success", title: "Save Location Changed", description: destPath });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to Change Location", description: String(err) });
    }
  };

  // Helper function to restore File objects from saved paths (Electron only).
  // restoreFileFromPath never throws — it returns null on any failure.  // Missing files are silently skipped; a single summary toast is shown at the end.
  const restoreFilesFromPaths = async (data: any) => {
    if (!window.electron?.readFileByPath) return;

    const missing: string[] = [];

    const tryRestore = async (filePath: string | undefined, label: string): Promise<File | null> => {
      if (!filePath) return null;
      const file = await restoreFileFromPath(filePath);
      if (!file) {
        console.warn(`[RESTORE] FAILED: "${filePath}" (${label})`);
        missing.push(filePath.split('\\').pop() || filePath.split('/').pop() || filePath);
      }
      return file;
    };

    const needsTypedOrTranslated = (copyType: string) =>
      copyType === 'true and typed copy' || copyType === 'true and translated copy';

    // listOfDates annexures
    for (let li = 0; li < (data.listOfDates ?? []).length; li++) {
      for (let ai = 0; ai < (data.listOfDates[li].annexures ?? []).length; ai++) {
        const annex = data.listOfDates[li].annexures[ai];
        if (annex.filePath && !(annex.file instanceof File))
          annex.file = await tryRestore(annex.filePath, `lod[${li}].annex[${ai}].file`);
        if (needsTypedOrTranslated(annex.copyType) && annex.typedOrTranslatedFilePath && !(annex.typedOrTranslatedFile instanceof File))
          annex.typedOrTranslatedFile = await tryRestore(annex.typedOrTranslatedFilePath, `lod[${li}].annex[${ai}].typedOrTranslatedFile`);
      }
    }

    // customIas grounds annexures
    for (let ii = 0; ii < (data.customIas ?? []).length; ii++) {
      for (let gi = 0; gi < (data.customIas[ii].grounds ?? []).length; gi++) {
        for (let ai = 0; ai < (data.customIas[ii].grounds[gi].annexures ?? []).length; ai++) {
          const annex = data.customIas[ii].grounds[gi].annexures[ai];
          if (annex.filePath && !(annex.file instanceof File))
            annex.file = await tryRestore(annex.filePath, `customIa[${ii}].ground[${gi}].annex[${ai}].file`);
          if (needsTypedOrTranslated(annex.copyType) && annex.typedOrTranslatedFilePath && !(annex.typedOrTranslatedFile instanceof File))
            annex.typedOrTranslatedFile = await tryRestore(annex.typedOrTranslatedFilePath, `customIa[${ii}].ground[${gi}].annex[${ai}].typedOrTranslatedFile`);
        }
      }
    }

    // standardIas grounds annexures
    for (const key of ['condonationOfDelay', 'exemptionFromSurrendering'] as const) {
      const grounds = data.standardIas?.[key]?.grounds ?? [];
      for (let gi = 0; gi < grounds.length; gi++) {
        for (let ai = 0; ai < (grounds[gi].annexures ?? []).length; ai++) {
          const annex = grounds[gi].annexures[ai];
          if (annex.filePath && !(annex.file instanceof File))
            annex.file = await tryRestore(annex.filePath, `standardIas.${key}.ground[${gi}].annex[${ai}].file`);
          if (needsTypedOrTranslated(annex.copyType) && annex.typedOrTranslatedFilePath && !(annex.typedOrTranslatedFile instanceof File))
            annex.typedOrTranslatedFile = await tryRestore(annex.typedOrTranslatedFilePath, `standardIas.${key}.ground[${gi}].annex[${ai}].typedOrTranslated`);
        }
      }
    }

    // PDF merge items
    for (let pi = 0; pi < (data.pdfMergeItems ?? []).length; pi++) {
      const item = data.pdfMergeItems[pi];
      if (item.userFilePath && !(item.userFile instanceof File))
        item.userFile = await tryRestore(item.userFilePath, `pdfMergeItem[${pi}].userFile`);
    }

    // Appendix
    if (data.appendixFilePath && !(data.appendixFile instanceof File))
      data.appendixFile = await tryRestore(data.appendixFilePath, "appendixFile");

    // Certified copy receipt
    const receipt = data.standardIas?.exemptionCertifiedCopy;
    if (receipt?.receiptFilePath && !(receipt.receiptFile instanceof File))
      data.standardIas.exemptionCertifiedCopy.receiptFile =
        await tryRestore(receipt.receiptFilePath, "receipt.receiptFile");

    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "Some files could not be restored",
        description: `${missing.length} file(s) were not found on disk and will need to be re-selected: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
      });
    }
  };

  const handleNew = () => {
    form.reset(newBlankProject());
    setCurrentFilePath(null);
    const defaultView = getSettings().slpTabView ?? 'splitter';
    setSlpViewMode(defaultView);
    window.dispatchEvent(new CustomEvent('drafto-new-project', { detail: { mode: defaultView } }));
    toast({ title: "New Project", description: "A new blank project has been created." });
  };
  
  const downloadDocx = async (docx: string, fileName: string) => {
    // Try Electron first (with default path)
    try {
      if (typeof window !== "undefined" && window.electron?.saveDocx) {
        const settings = getSettings();
        
        // Get case name for subfolder
        const data = form.getValues();
        const petitionerName = getProjectFileName(data);
        
        const savedPath = await window.electron.saveDocx({
          fileName,
          content: docx,
          defaultPath: settings.defaultDocxPath || undefined,
          projectFolder: petitionerName,
        });
        if (savedPath) {
          incrementGenerationCount('docx');
          toast({ title: "DOCX Generated", description: `Saved to ${savedPath}` });
          const dir = savedPath.replace(/[\\/][^\\/]+$/, '');
          window.electron.openFolderPath?.(dir);
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
    incrementGenerationCount('docx');
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
      <div className="flex items-center gap-1">
        <img src="./drafto-logo.png" alt="Drafto Logo" className="h-7 w-auto translate-x-0.5" />
        <h1 className="text-base font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>DraftoSLP</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="Undo" onClick={undo} disabled={!canUndo}><Undo /></Button>
        <Button variant="ghost" size="icon" title="Redo" onClick={redo} disabled={!canRedo}><Redo /></Button>

        <Separator orientation="vertical" className="h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">Project</Button>
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
            <DropdownMenuSeparator />
            {currentFilePath && (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground max-w-[280px] truncate">
                📂 {currentFilePath.split(/[\\/]/).pop()}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleChangeSaveLocation} disabled={!window.electron?.saveProjectToPath}>
              <FolderOpen className="mr-2" />Change Save Location
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title="Export Word Document (.docx)" disabled={isPending}>
              {isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <span className="relative inline-flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <span className="absolute -bottom-1.5 -right-1.5 text-[6px] font-bold leading-none text-white bg-blue-600 rounded-sm px-0.5 py-px">DOC</span>
                  </span>
              }
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

        <ImportChangesDialog />

        <PdfGenerationDialog>
          <Button variant="ghost" size="icon" title="Export PDF Paperbook" disabled={isPending}>
            {isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <span className="relative inline-flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                  <span className="absolute -bottom-1.5 -right-1.5 text-[6px] font-bold leading-none text-white bg-red-600 rounded-sm px-0.5 py-px">PDF</span>
                </span>
            }
          </Button>
        </PdfGenerationDialog>

        <Separator orientation="vertical" className="h-6" />

        <SettingsDialog>
          <Button variant="ghost" size="sm" className="relative">
            <Settings className="h-4 w-4" />
            {updateAvailable && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-500" />
            )}
          </Button>
        </SettingsDialog>

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
        onLoadFromPath={handleLoadFromPath}
      />
    </header>
  );
}


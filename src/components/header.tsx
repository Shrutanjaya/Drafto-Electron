import React, { useRef, useTransition, useState, useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  FolderOpen,
  Save,
  FilePlus,
  Undo,
  Redo,
  FileDown,
  FileText,
  FileDiff,
  Settings,
  LogOut,
  User,
  Loader2,
  History,
  ChevronDown,
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
import { getRecentProjects, pushRecentProject, removeRecentProject, type RecentProject } from "@/lib/recent-projects";
import { ModeSelectDialog } from "./dialogs/mode-select-dialog";
import { generateWpIndex, generateWpNoticeOfMotion, generateWpUrgencyApplication, generateWpMemoOfParties, generateWpSynopsisAndLod, generateWpPetition, generateWpVakalatnama, generateWpCms } from "@/lib/wp/wp-actions";
import { generateWpPdf } from "@/lib/wp/wp-pdf";
import { WpPdfGenerationDialog } from "./dialogs/wp-pdf-generation-dialog";
import { WP_ENABLED } from "@/lib/wp/wp-enabled";
import { OA_ENABLED } from "@/lib/oa/oa-enabled";
import {
  generateOaAll, generateOaBody, generateOaIndexDoc, generateOaMemoDoc,
  generateOaSynopsisDoc, generateOaApplicationsDoc, generateOaSigningPagesDoc,
} from "@/lib/oa/oa-actions";
import { generateOaPdf } from "@/lib/oa/oa-pdf";
import { OaPdfGenerationDialog } from "./dialogs/oa-pdf-generation-dialog";
import { SettingsDialog, getSettings } from "./dialogs/settings-dialog";
import { newBlankProject } from "@/lib/project-defaults";
import { getIaList } from "@/lib/ia-list-utils";
import { getActiveAppendixItems } from "@/lib/appendix";
import { restoreFileFromPath } from "@/lib/utils/pick-file";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/providers/auth-provider";
import { useEntitlement, useExportPermission } from "@/providers/entitlement-provider";
import { allowsCourtType, forumOf, FORUM_LABEL, type CourtType } from "@/lib/entitlement/entitlement";
import { ENTITLEMENT_ENABLED } from "@/lib/entitlement/entitlement-enabled";
import { ToastAction } from "@/components/ui/toast";
import { incrementGenerationCount } from "@/lib/firebase/usage-service";

/** The court a document type belongs to, in the words a lawyer would use. */
function courtLabel(courtType: string | undefined): string {
  const forum = forumOf((courtType ?? "SLP") as CourtType);
  return forum ? FORUM_LABEL[forum] : "This court";
}

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

// Project-file extension by document type. A Delhi HC writ petition saves as
// .dhcwp so it never overwrites an SLP (.drafto) for the same parties — e.g.
// during autosave, since the filename is derived from the party names.
export function projectExtensionFor(data: { courtType?: string }): string {
  return data.courtType === "WritPetitionDHC" ? "dhcwp" : "drafto";
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
  const { entitlement, loading: entLoading, openManageSubscription } = useEntitlement();
  const courtType = useWatch({ control: form.control, name: "courtType" });
  // Generation is gated on the subscription AND on this court being on the plan.
  const exportPermission = useExportPermission((courtType ?? "SLP") as CourtType);
  const [isPending, startTransition] = useTransition();
  const [draftSelection, setDraftSelection] = useState<DraftSelection>(
    draftOptions.reduce((acc, opt) => ({ ...acc, [opt.id]: false }), {} as DraftSelection)
  );
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // Import-tracked-changes dialog, now opened from the DOCX menu.
  const [importOpen, setImportOpen] = useState(false);
  // Recent projects (Quick Load). Kept in sync with the MRU store.
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => getRecentProjects());
  useEffect(() => {
    const onChange = () => setRecentProjects(getRecentProjects());
    window.addEventListener("drafto-recent-projects-changed", onChange);
    return () => window.removeEventListener("drafto-recent-projects-changed", onChange);
  }, []);
  // Any project opened/saved to a real path becomes the most-recent entry.
  useEffect(() => {
    if (currentFilePath) pushRecentProject(currentFilePath);
  }, [currentFilePath]);
  // Draft-type prompt (SLP vs Delhi HC writ petition). 'startup' fires once on
  // launch; 'new' fires from the New Project action. null = closed.
  const [modeDialog, setModeDialog] = useState<null | "startup" | "new">(null);

  // Prompt for the draft type on app launch — dev only. In production the WP
  // mode is hidden, so there is no prompt and the app opens straight into the
  // SLP interface (unchanged customer experience).
  useEffect(() => { if (WP_ENABLED || OA_ENABLED) setModeDialog("startup"); }, []);

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
        // Colly constituent files (Delhi HC writ petitions)
        for (let k = 0; k < (annex.collyDocuments ?? []).length; k++) {
          const cp = getPath(annex.collyDocuments[k].file);
          if (cp) cloned.listOfDates[i].annexures[j].collyDocuments[k].filePath = cp;
        }
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

    // WP filing uploads (Court Fee, Proof of Service, signed Affidavit/Vakalatnama)
    for (const k of ['courtFee', 'proofOfService', 'signedAffidavit', 'signedVakalatnama'] as const) {
      const p = getPath(data.wp?.uploads?.[k]?.file);
      if (p && cloned.wp?.uploads?.[k]) cloned.wp.uploads[k].filePath = p;
    }

    // WP custom-CM ground annexures (A-series)
    for (let i = 0; i < (data.wp?.customCms ?? []).length; i++) {
      for (let j = 0; j < (data.wp.customCms[i].grounds ?? []).length; j++) {
        for (let k = 0; k < (data.wp.customCms[i].grounds[j].annexures ?? []).length; k++) {
          const p = getPath(data.wp.customCms[i].grounds[j].annexures[k].file);
          if (p) cloned.wp.customCms[i].grounds[j].annexures[k].filePath = p;
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

    // Appendix documents
    for (let i = 0; i < (data.appendixItems ?? []).length; i++) {
      const p = getPath(data.appendixItems[i].file);
      if (p && cloned.appendixItems?.[i]) cloned.appendixItems[i].filePath = p;
    }

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
        const destPath = `${defaultDraftoPath}${sep}${petitionerName}.${projectExtensionFor(data)}`;
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
          extension: projectExtensionFor(data),
        });
        if (savedPath) setCurrentFilePath(savedPath);
        toast({ variant: "success", title: "Saved" });
        return;
      }
    } catch (err) {
      console.error("Electron save failed, falling back to download:", err);
    }

    const blob = new Blob([jsonString], { type: "application/json" });
    saveAs(blob, `${petitionerName}.${projectExtensionFor(data)}`);
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
          noticeIfUncovered(validatedData);
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
      noticeIfUncovered(validatedData);
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
      noticeIfUncovered(validatedData);
      toast({ title: "Project Loaded", description: filePath.split(/[\\/]/).pop() });
    } catch (err) {
      console.error("Load from path error:", err);
      toast({ variant: "destructive", title: "Load Failed", description: String(err) });
      throw err; // let Quick Load prune a path that no longer opens
    }
  };

  // Quick Load: reopen a recent project; drop it from the list if it's gone.
  const handleQuickLoad = async (rp: RecentProject) => {
    try {
      await handleLoadFromPath(rp.path);
    } catch {
      removeRecentProject(rp.path);
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
    const destPath = `${dir}${sep}${petitionerName}.${projectExtensionFor(data)}`;
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
        // Colly constituent files (Delhi HC writ petitions)
        for (let ci = 0; ci < (annex.collyDocuments ?? []).length; ci++) {
          const cd = annex.collyDocuments[ci];
          if (cd.filePath && !(cd.file instanceof File))
            cd.file = await tryRestore(cd.filePath, `lod[${li}].annex[${ai}].colly[${ci}].file`);
        }
      }
    }

    // WP filing uploads
    for (const k of ['courtFee', 'proofOfService', 'signedAffidavit', 'signedVakalatnama'] as const) {
      const u = data.wp?.uploads?.[k];
      if (u?.filePath && !(u.file instanceof File)) u.file = await tryRestore(u.filePath, `wp.uploads.${k}.file`);
    }

    // WP custom-CM ground annexures (A-series)
    for (let ii = 0; ii < (data.wp?.customCms ?? []).length; ii++) {
      for (let gi = 0; gi < (data.wp.customCms[ii].grounds ?? []).length; gi++) {
        for (let ai = 0; ai < (data.wp.customCms[ii].grounds[gi].annexures ?? []).length; ai++) {
          const annex = data.wp.customCms[ii].grounds[gi].annexures[ai];
          if (annex.filePath && !(annex.file instanceof File))
            annex.file = await tryRestore(annex.filePath, `wp.customCm[${ii}].ground[${gi}].annex[${ai}].file`);
        }
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

    // Appendix documents (older projects carry a single appendixFile/-Path pair;
    // lib/appendix.ts folds those into the list when it is read)
    for (let i = 0; i < (data.appendixItems ?? []).length; i++) {
      const item = data.appendixItems[i];
      if (item.filePath && !(item.file instanceof File))
        item.file = await tryRestore(item.filePath, `appendixItems[${i}].file`);
    }
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

  // New Project now asks the user which document type to start.
  const handleNew = () => {
    if (WP_ENABLED || OA_ENABLED) { setModeDialog("new"); return; }
    // Production (WP hidden): New Project creates a blank SLP directly.
    form.reset(newBlankProject("SLP"));
    setCurrentFilePath(null);
    const defaultView = getSettings().slpTabView ?? 'splitter';
    window.dispatchEvent(new CustomEvent('drafto-new-project', { detail: { mode: defaultView } }));
    toast({ title: "New Project", description: "A new blank project has been created." });
  };

  // Apply the chosen draft type. On startup, if the user keeps SLP the launch
  // project already matches, so we leave it untouched; otherwise we reset to a
  // fresh blank project of the chosen type.
  const applyDraftMode = (courtType: DraftoProject["courtType"]) => {
    const reason = modeDialog;
    setModeDialog(null);
    if (reason === "startup" && courtType === form.getValues("courtType")) return;
    form.reset(newBlankProject(courtType));
    setCurrentFilePath(null);
    const defaultView = getSettings().slpTabView ?? 'splitter';
    window.dispatchEvent(new CustomEvent('drafto-new-project', { detail: { mode: defaultView } }));
    if (reason === "new") {
      const label = courtType === "WritPetitionDHC" ? "Writ Petition (Delhi HC)"
        : courtType === "OriginalApplicationCAT" ? "Original Application (CAT)"
        : "SLP";
      toast({ title: "New Project", description: `A new blank ${label} project has been created.` });
    }
  };
  
  // Paper-book generation requires an active subscription. The SLP paper-book
  // checks this inside its own submit handler; the HC and CAT paper-books are
  // generated from here, so they are refused at the same point rather than only
  // by a disabled button — a button can be bypassed by a future shortcut or
  // menu entry, a refusal at the action cannot.
  /**
   * After a project is opened, say plainly if its court is not on the plan.
   * The file always opens — it is the user's own work, and refusing to show it
   * helps nobody — but they should be told at the moment they are wondering,
   * not discover it later by finding they cannot type.
   */
  const noticeIfUncovered = (loaded: { courtType?: string } | null | undefined) => {
    if (!ENTITLEMENT_ENABLED || entLoading || !loaded) return;
    const ct = (loaded.courtType ?? "SLP") as CourtType;
    if (allowsCourtType(entitlement, ct)) return;
    toast({
      title: "Opened read-only",
      description: `The file has been opened in read-only mode since your plan does not include drafts for the ${courtLabel(ct)}.`,
      duration: 8000,
    });
  };

  const blockedByEntitlement = () => {
    if (exportPermission.allowed) return false;
    if (exportPermission.reason === "court") {
      toast({
        variant: "destructive",
        title: "Not on your plan",
        description: `${courtLabel(courtType)} is not included in your plan, so this paper-book cannot be generated.`,
        action: (
          <ToastAction altText="Upgrade" onClick={openManageSubscription}>
            Upgrade
          </ToastAction>
        ),
      });
      return true;
    }
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
    return true;
  };

  const downloadDocx = async (docx: string, fileName: string) => {
    // Same gate as the paper-book: an active subscription AND this court on the
    // plan. A document is a document, whichever button produced it.
    if (blockedByEntitlement()) return;

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
          window.electron.revealFilePath?.(savedPath);
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


  // ── Writ Petition (Delhi HC) document generation ──────────────────────────
  const wpGenerators: { id: string; label: string; fn: (d: DraftoProject) => Promise<{ success: boolean; docx?: string; fileName: string }> }[] = [
    { id: "index", label: "Index", fn: generateWpIndex },
    { id: "notice", label: "Notice of Motion", fn: generateWpNoticeOfMotion },
    { id: "urgency", label: "Urgency Application", fn: generateWpUrgencyApplication },
    { id: "memo", label: "Memo of Parties", fn: generateWpMemoOfParties },
    { id: "slod", label: "Synopsis & List of Dates", fn: generateWpSynopsisAndLod },
    { id: "petition", label: "Writ Petition (with Affidavit)", fn: generateWpPetition },
    { id: "cms", label: "CM Applications", fn: generateWpCms },
    { id: "vakalatnama", label: "Vakalatnama", fn: generateWpVakalatnama },
  ];

  // ── CAT Original Application ──
  // Make the finished paper-book text-searchable. Windows only (the bundled
  // Tesseract pipeline); a failure is reported but never loses the PDF.
  const runOcrPass = async (pdfBase64: string): Promise<string> => {
    if (!window.electron?.processOcr) return pdfBase64;
    toast({ title: "Running OCR…", description: "Making the scanned pages text-searchable. This takes a while." });
    try {
      const r = await window.electron.processOcr(pdfBase64);
      if (r.success && r.pdf) return r.pdf;
      if (r.error === "cancelled") return pdfBase64;
      throw new Error(r.error || "OCR failed");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "OCR failed",
        description: `${err instanceof Error ? err.message : String(err)} — saving the paper-book without it.`,
      });
      return pdfBase64;
    }
  };

  const handleGenerateOaPdf = (opts?: { ocr?: boolean }) => {
    if (blockedByEntitlement()) return;
    startTransition(async () => {
      toast({ title: "Generating PDF…", description: "Assembling the Original Application paper-book." });
      const result = await generateOaPdf(form.getValues(), (label) => toast({ title: "Generating PDF…", description: label }));
      if (!result.success || !result.pdfBase64) {
        toast({ variant: "destructive", title: "PDF Failed", description: result.error || "Could not assemble the PDF." });
        return;
      }
      if (opts?.ocr) result.pdfBase64 = await runOcrPass(result.pdfBase64);
      const settings = getSettings();
      try {
        if (typeof window !== "undefined" && window.electron?.savePdf) {
          const savedPath = await window.electron.savePdf({
            fileName: result.fileName,
            content: result.pdfBase64,
            defaultPath: (settings as any).defaultPdfPath || undefined,
            projectFolder: getProjectFileName(form.getValues()),
          });
          if (savedPath) {
            toast({ title: "PDF Saved", description: savedPath });
            window.electron.revealFilePath?.(savedPath);
            return;
          }
        }
      } catch { /* fall through to browser download */ }
      const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/pdf" }), result.fileName);
    });
  };


  const handleExportOa = (fn: (d: DraftoProject) => Promise<{ success: boolean; docx?: string; fileName: string }>) => {
    startTransition(async () => {
      const result = await fn(form.getValues());
      if (result?.success && result.docx) await downloadDocx(result.docx, result.fileName);
      else toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the document." });
    });
  };

  // Individual CAT components, in filing order. "Signing Pages" bundles the
  // Last Page(s), Vakalatnama and every application's Affidavit.
  const oaGenerators: { id: string; label: string; fn: (d: DraftoProject) => Promise<{ success: boolean; docx?: string; fileName: string }> }[] = [
    { id: "index", label: "Index", fn: (d) => generateOaIndexDoc(d) },
    { id: "memo", label: "Memo of Parties", fn: generateOaMemoDoc },
    { id: "synopsis", label: "Synopsis and List of Dates", fn: generateOaSynopsisDoc },
    { id: "applications", label: "MA / Petition for Transfer", fn: generateOaApplicationsDoc },
    { id: "oa", label: "Original Application", fn: generateOaBody },
    { id: "signing", label: "Signing Pages", fn: generateOaSigningPagesDoc },
  ];

  const handleExportWp = (fn: (d: DraftoProject) => Promise<{ success: boolean; docx?: string; fileName: string }>) => {
    startTransition(async () => {
      const result = await fn(form.getValues());
      if (result?.success && result.docx) await downloadDocx(result.docx, result.fileName);
      else toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the document." });
    });
  };

  const handleGenerateAllWp = () => {
    startTransition(async () => {
      const data = form.getValues();
      for (const g of wpGenerators) {
        const r = await g.fn(data);
        if (r?.success && r.docx) await downloadDocx(r.docx, r.fileName);
      }
    });
  };

  const handleGenerateWpPdf = (opts?: { ocr?: boolean }) => {
    if (blockedByEntitlement()) return;
    startTransition(async () => {
      toast({ title: "Generating PDF…", description: "Assembling the writ-petition paper-book." });
      const result = await generateWpPdf(form.getValues());
      if (!result.success || !result.pdfBase64) {
        toast({ variant: "destructive", title: "PDF Failed", description: result.error || "Could not assemble the PDF." });
        return;
      }
      if (opts?.ocr) result.pdfBase64 = await runOcrPass(result.pdfBase64);
      const offerBriefing = () => window.dispatchEvent(new CustomEvent("drafto-offer-briefing", { detail: { pageByAnnexId: result.annexureFirstPages || {} } }));
      const settings = getSettings();
      try {
        if (typeof window !== "undefined" && window.electron?.savePdf) {
          const savedPath = await window.electron.savePdf({ fileName: result.fileName, content: result.pdfBase64, defaultPath: (settings as any).defaultPdfPath || undefined });
          if (savedPath) {
            toast({ title: "PDF Saved", description: savedPath });
            window.electron.revealFilePath?.(savedPath);
            offerBriefing();
            return;
          }
        }
      } catch { /* fall through to browser download */ }
      const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: "application/pdf" }), result.fileName);
      offerBriefing();
    });
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
            // Only typed-out Appendix documents can be exported as a DOCX;
            // uploaded PDFs go straight into the paper-book.
            if (getActiveAppendixItems(data).some(i => i.useManual && (i.manualEntry || '').trim())) {
                result = await generateAppendixDocx(data);
            } else {
                toast({ variant: "destructive", title: "Export Skipped", description: "There is no typed-out Appendix to export." });
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
        <h1 className="text-base font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>Drafto</h1>
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
            {courtType === "OriginalApplicationCAT" ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <FileDown className="mr-2" />
                    <span>Original Application</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-1">
                    <DropdownMenuItem onSelect={() => handleExportOa(generateOaAll)}>
                        <FileDown className="mr-2" />Complete Document
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {oaGenerators.map(g => (
                        <DropdownMenuItem key={g.id} onSelect={() => handleExportOa(g.fn)}>
                            {g.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : courtType === "WritPetitionDHC" ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <FileDown className="mr-2" />
                    <span>Writ Petition</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-1">
                    <DropdownMenuItem onSelect={handleGenerateAllWp}>
                        <FileDown className="mr-2" />All Documents (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {wpGenerators.map(g => (
                        <DropdownMenuItem key={g.id} onSelect={() => handleExportWp(g.fn)}>
                            {g.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <>
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
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setImportOpen(true)}>
              <FileDiff className="mr-2" />Import tracked changes…
              <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Beta</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Controlled: opened from the DOCX menu above (no standalone button). */}
        <ImportChangesDialog open={importOpen} onOpenChange={setImportOpen} />

        {(() => {
          const pdfButtonInner = (
            isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <span className="relative inline-flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                  <span className="absolute -bottom-1.5 -right-1.5 text-[6px] font-bold leading-none text-white bg-red-600 rounded-sm px-0.5 py-px">PDF</span>
                </span>
          );
          // A loaded writ petition uses the WP paper-book assembler; the same
          // button opens the SLP paper-book dialog otherwise.
          if (courtType === "OriginalApplicationCAT") {
            return (
              <OaPdfGenerationDialog onGenerate={handleGenerateOaPdf} isPending={isPending}>
                <Button variant="ghost" size="icon" title="Generate Original Application Paperbook (PDF)" disabled={isPending}>
                  {pdfButtonInner}
                </Button>
              </OaPdfGenerationDialog>
            );
          }
          return courtType === "WritPetitionDHC" ? (
            <WpPdfGenerationDialog onGenerate={handleGenerateWpPdf} isPending={isPending}>
              <Button variant="ghost" size="icon" title="Generate Writ Petition Paperbook (PDF)" disabled={isPending}>
                {pdfButtonInner}
              </Button>
            </WpPdfGenerationDialog>
          ) : (
            <PdfGenerationDialog>
              <Button variant="ghost" size="icon" title="Export PDF Paperbook" disabled={isPending}>
                {pdfButtonInner}
              </Button>
            </PdfGenerationDialog>
          );
        })()}

        <Separator orientation="vertical" className="h-6" />

        <SettingsDialog>
          <Button variant="ghost" size="sm" className="relative">
            <Settings className="h-4 w-4" />
            {updateAvailable && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-500" />
            )}
          </Button>
        </SettingsDialog>

        {/* Quick Load — the last few projects, one click to reopen. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 px-2" title="Quick Load a recent project">
              <History className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[240px]">
            <DropdownMenuLabel className="text-xs">Recent projects</DropdownMenuLabel>
            {recentProjects.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">No recent projects yet</DropdownMenuItem>
            ) : (
              recentProjects.slice(0, 3).map((rp) => (
                <DropdownMenuItem key={rp.path} onSelect={() => handleQuickLoad(rp)} className="text-xs" title={rp.path}>
                  <FolderOpen className="mr-2 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[210px]">{rp.name}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => {
                if (window.electron?.listDraftoFiles) setShowLoadDialog(true);
                else fileInputRef.current?.click();
              }}
            >
              <FolderOpen className="mr-2 h-3.5 w-3.5" />Load another project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
        accept=".drafto,.dhcwp"
        className="hidden"
      />
      <LoadProjectDialog
        open={showLoadDialog}
        onOpenChange={setShowLoadDialog}
        onLoadFromPath={handleLoadFromPath}
      />
      <ModeSelectDialog open={modeDialog !== null} onSelect={applyDraftMode} />
    </header>
  );
}


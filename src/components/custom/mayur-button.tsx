import React, { createContext, useContext, useEffect, useState } from "react";
import { useFormContext, type FieldValues, type UseFormReturn } from "react-hook-form";
import {
  Sparkles,
  FileText,
  FolderOpen,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Wand2,
  Square,
  Trash2,
  FileUp,
  Undo2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { getSettings, type AiProvider } from "@/components/dialogs/settings-dialog";
import {
  executeMayurTask,
  getMayurSectionMeta,
  type MayurSectionId,
  type MayurUsage,
} from "@/lib/ai/mayur-engine";
import type { DraftoProject } from "@/lib/schema";
import { cn } from "@/lib/utils";

export type MayurMode = "verbatim" | "construct" | "derive";

interface MayurContextValue {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  contextDir: string | null;
  sourceLabel: string | null;
  scannedFiles: AiScanFile[];
  scanningRaw: boolean;
  partyRoleHint: string;
  setPartyRoleHint: (role: string) => void;
  scanSourceFiles: (filePaths: string[], label?: string) => Promise<boolean>;
  scanSourceFolder: (folderPath: string) => Promise<boolean>;
  clearRawMaterial: () => void;
  openMayurSettings: () => void;
  openTaskDialog: (req: {
    section: MayurSectionId;
    mode: MayurMode;
    customTitle?: string;
  }) => void;
}

const MayurContext = createContext<MayurContextValue | null>(null);

function getDroppedFilePaths(e: React.DragEvent): string[] {
  const files = Array.from(e.dataTransfer?.files || []);
  const paths: string[] = [];
  for (const f of files) {
    const p = (f as unknown as { path?: string }).path;
    if (p && typeof p === "string") {
      paths.push(p);
    }
  }
  return paths;
}

function formatFieldSummary(paths: string[], form: UseFormReturn<DraftoProject>): string {
  const labels: string[] = [];
  const unique = Array.from(new Set(paths));
  for (const p of unique) {
    if (p === "listOfDates") {
      const rows = form.getValues("listOfDates");
      labels.push(`List of Dates: ${Array.isArray(rows) ? rows.length : 0} rows`);
    } else if (p === "grounds") {
      const rows = form.getValues("grounds");
      labels.push(`Grounds: ${Array.isArray(rows) ? rows.length : 0} items`);
    } else if (p === "questionsOfLaw") {
      const rows = form.getValues("questionsOfLaw");
      labels.push(`Questions of Law: ${Array.isArray(rows) ? rows.length : 0} items`);
    } else if (p === "synopsis") {
      labels.push("Synopsis");
    } else if (p === "petitioners") {
      const rows = form.getValues("petitioners");
      labels.push(`${Array.isArray(rows) ? rows.length : 0} Petitioner(s)`);
    } else if (p === "respondents") {
      const rows = form.getValues("respondents");
      labels.push(`${Array.isArray(rows) ? rows.length : 0} Respondent(s)`);
    } else if (p === "impugnedOrders") {
      labels.push("Impugned Order");
    } else if (p.startsWith("deponent")) {
      if (!labels.includes("Deponent details")) labels.push("Deponent details");
    } else if (p.startsWith("listingProforma")) {
      if (!labels.includes("Listing Proforma")) labels.push("Listing Proforma");
    } else if (p.startsWith("interim") || p === "wantsInterimRelief") {
      if (!labels.includes("Interim relief")) labels.push("Interim relief");
    } else {
      labels.push(p.split(".").pop() || p);
    }
  }
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

export function MayurProvider({ children }: { children: React.ReactNode }) {
  const form = useFormContext<DraftoProject>();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState<boolean>(() => getSettings().aiPluginEnabled);
  const [provider, setProvider] = useState<AiProvider>(() => getSettings().aiProvider);
  const [model, setModel] = useState<string>(() => getSettings().aiModel);

  // Shared raw material pool so the user doesn't have to re-upload the paperbook for every section button
  const [contextDir, setContextDir] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [scannedFiles, setScannedFiles] = useState<AiScanFile[]>([]);
  const [scanningRaw, setScanningRaw] = useState(false);
  const [partyRoleHint, setPartyRoleHint] = useState<string>("auto");

  // Active dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<MayurSectionId>("lod");
  const [activeMode, setActiveMode] = useState<MayurMode>("verbatim");
  const [activeCustomTitle, setActiveCustomTitle] = useState<string | undefined>(undefined);

  // Option [i] Verbatim Draft state
  const [draftFilePath, setDraftFilePath] = useState<string | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [draftFormat, setDraftFormat] = useState<"docx" | "pdf" | null>(null);
  const [draftTokens, setDraftTokens] = useState<number>(0);
  const [extractingDraft, setExtractingDraft] = useState(false);
  const [draftExtractError, setDraftExtractError] = useState<string | null>(null);

  // Shared user guidance note & execution state
  const [userHint, setUserHint] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [runningTask, setRunningTask] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [liveUsage, setLiveUsage] = useState<{ input: number; output: number; total: number } | null>(null);
  const [lastRunUsage, setLastRunUsage] = useState<MayurUsage | null>(null);

  // Sync settings changes
  useEffect(() => {
    const sync = () => {
      const s = getSettings();
      setEnabled(s.aiPluginEnabled);
      setProvider(s.aiProvider);
      setModel(s.aiModel);
    };
    window.addEventListener("drafto-settings-changed", sync);
    return () => window.removeEventListener("drafto-settings-changed", sync);
  }, []);

  const openMayurSettings = () => {
    setDialogOpen(false);
    window.dispatchEvent(new CustomEvent("drafto-open-settings", { detail: { section: "customize" } }));
  };

  const scanSourceFiles = async (filePaths: string[], label?: string): Promise<boolean> => {
    if (!window.electron?.aiScanFiles) {
      toast({ variant: "destructive", title: "Desktop required", description: "File scanning is only available in the PaperBook desktop app." });
      return false;
    }
    const validPaths = filePaths.filter((p) => /\.(pdf|docx)$/i.test(p));
    if (validPaths.length === 0) {
      toast({ variant: "destructive", title: "Unsupported files", description: "Please supply .pdf or .docx files." });
      return false;
    }
    setScanningRaw(true);
    setTaskError(null);
    try {
      const res = await window.electron.aiScanFiles(validPaths);
      if (!res?.ok || !res.contextDir) {
        setTaskError(res?.error || "Could not extract text from the selected files.");
        return false;
      }
      setContextDir(res.contextDir);
      setSourceLabel(label || `${validPaths.length} file${validPaths.length === 1 ? "" : "s"} selected`);
      setScannedFiles(res.files || []);
      return true;
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setScanningRaw(false);
    }
  };

  const scanSourceFolder = async (folderPath: string): Promise<boolean> => {
    if (!window.electron?.aiScanFolder) {
      toast({ variant: "destructive", title: "Desktop required", description: "Folder scanning is only available in the PaperBook desktop app." });
      return false;
    }
    setScanningRaw(true);
    setTaskError(null);
    try {
      const res = await window.electron.aiScanFolder(folderPath);
      if (!res?.ok || !res.contextDir) {
        setTaskError(res?.error || "Could not scan the selected folder.");
        return false;
      }
      setContextDir(res.contextDir);
      const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
      setSourceLabel(`Folder: ${folderName}`);
      setScannedFiles(res.files || []);
      return true;
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setScanningRaw(false);
    }
  };

  const clearRawMaterial = () => {
    setContextDir(null);
    setSourceLabel(null);
    setScannedFiles([]);
  };

  const loadVerbatimDraftFile = async (filePath: string) => {
    if (!window.electron?.aiExtractDraft) {
      setDraftExtractError("Draft extraction is only available in the PaperBook desktop app.");
      return;
    }
    if (!/\.(docx|pdf)$/i.test(filePath)) {
      setDraftExtractError("Please select a .docx or .pdf draft file.");
      return;
    }
    setExtractingDraft(true);
    setDraftExtractError(null);
    setTaskError(null);
    try {
      const res = await window.electron.aiExtractDraft(filePath);
      if (!res?.ok || !res.richText) {
        setDraftExtractError(res?.error || "Could not read the draft file.");
        setDraftFilePath(null);
        return;
      }
      setDraftFilePath(filePath);
      setDraftFileName(res.fileName || filePath.split(/[\\/]/).pop() || filePath);
      setDraftFormat(res.format || (filePath.toLowerCase().endsWith(".docx") ? "docx" : "pdf"));
      setDraftTokens(res.tokens || 0);
    } catch (err) {
      setDraftExtractError(err instanceof Error ? err.message : String(err));
      setDraftFilePath(null);
    } finally {
      setExtractingDraft(false);
    }
  };

  const handleBrowseDraftFile = async () => {
    if (!window.electron?.aiSelectDraftFile) {
      toast({ variant: "destructive", title: "Desktop required", description: "File selection is only available in the desktop app." });
      return;
    }
    const picked = await window.electron.aiSelectDraftFile();
    if (picked) {
      await loadVerbatimDraftFile(picked);
    }
  };

  const handleBrowseRawFiles = async () => {
    if (!window.electron?.aiSelectSourceFiles) return;
    const files = await window.electron.aiSelectSourceFiles();
    if (files && files.length > 0) {
      await scanSourceFiles(files);
    }
  };

  const handleBrowseRawFolder = async () => {
    if (!window.electron?.selectDirectory) return;
    const folder = await window.electron.selectDirectory();
    if (folder) {
      await scanSourceFolder(folder);
    }
  };

  const openTaskDialog = (req: {
    section: MayurSectionId;
    mode: MayurMode;
    customTitle?: string;
  }) => {
    const s = getSettings();
    setProvider(s.aiProvider);
    setModel(s.aiModel);
    setActiveSection(req.section);
    setActiveMode(req.mode);
    setActiveCustomTitle(req.customTitle);
    setTaskError(null);
    setStatusMessage(null);
    setUserHint("");
    setDialogOpen(true);
  };

  const handleStopTask = async () => {
    if (window.electron?.aiCancel) {
      await window.electron.aiCancel();
    }
    setRunningTask(false);
    setStatusMessage("Stopped by user.");
  };

  const handleRunMayur = async () => {
    const currentValues = form.getValues();
    const s = getSettings();

    // Verify API key is configured before starting
    if (window.electron?.aiGetKeysStatus) {
      const keyRes = await window.electron.aiGetKeysStatus();
      const isConfigured = keyRes && !("error" in keyRes) && keyRes[s.aiProvider]?.hasKey;
      if (!isConfigured) {
        const providerTitle =
          s.aiProvider === "gemini" ? "Google Gemini" : s.aiProvider === "anthropic" ? "Anthropic (Claude)" : "OpenAI (ChatGPT)";
        setTaskError(`No API key is saved for ${providerTitle}. Click "Configure API Key" below to paste your key in Settings → Mayur (AI).`);
        return;
      }
    }

    if (activeMode === "verbatim" && !draftFilePath) {
      setTaskError("Please select or drop a .docx or .pdf draft file first.");
      return;
    }

    if (activeMode === "construct" && (!contextDir || scannedFiles.length === 0)) {
      setTaskError("Please supply the Impugned Order(s) / High Court paperbook files or folder first.");
      return;
    }

    // Capture a full deep snapshot of the form for one-click Undo
    const preRunSnapshot = JSON.parse(JSON.stringify(currentValues)) as DraftoProject;

    setRunningTask(true);
    setTaskError(null);
    setLiveUsage(null);
    setLastRunUsage(null);
    setStatusMessage("Starting Mayur…");

    const roleHintText =
      partyRoleHint === "petitioner"
        ? "We represent the Aggrieved Petitioner / Appellant / Applicant."
        : partyRoleHint === "respondent"
          ? "We represent the Respondent."
          : undefined;

    const offStream = window.electron?.onAiStream
      ? window.electron.onAiStream((evt: any) => {
          if (evt?.kind === "status" && evt.text) {
            setStatusMessage(evt.text);
          }
          if (evt?.kind === "usage") {
            setLiveUsage({
              input: evt.input ?? 0,
              output: evt.output ?? 0,
              total: evt.total ?? ((evt.input ?? 0) + (evt.output ?? 0)),
            });
          }
        })
      : null;

    try {
      const result = await executeMayurTask({
        form: form as unknown as UseFormReturn<FieldValues>,
        sectionId: activeSection,
        mode: activeMode,
        draftFilePath: activeMode === "verbatim" ? (draftFilePath || undefined) : undefined,
        contextDir: activeMode === "construct" ? (contextDir || undefined) : undefined,
        partyRoleHint: roleHintText,
        userGuidance: userHint.trim() || undefined,
        onStatus: (stage) => setStatusMessage(stage),
        onSectionComplete: (stepNotif) => {
          const tokenDesc = `${stepNotif.totalTokens.toLocaleString()} tokens (${stepNotif.inputTokens.toLocaleString()} prompt, ${stepNotif.outputTokens.toLocaleString()} output)`;
          let description = "";
          if (stepNotif.ok) {
            const countLabel = `${stepNotif.opCount} field${stepNotif.opCount === 1 ? "" : "s"}`;
            const fieldsSummary =
              stepNotif.fieldsApplied.length > 0
                ? ` (${formatFieldSummary(stepNotif.fieldsApplied, form)})`
                : "";
            description = `Filled ${countLabel}${fieldsSummary} • ${tokenDesc}`;
            if (stepNotif.truncated) {
              description += `\n⚠️ Output token limit reached — model generation was cut off before full completion.`;
            }
            if (stepNotif.skippedNotes && stepNotif.skippedNotes.length > 0) {
              description += `\nSkipped: ${stepNotif.skippedNotes.slice(0, 3).join("; ")}`;
            }
          } else {
            const reasonStr =
              stepNotif.reasonsFailed?.join("; ") || "No matching material found in case papers.";
            description = `Could not complete: ${reasonStr} • ${tokenDesc}`;
            if (stepNotif.truncated) {
              description += `\n⚠️ Output token limit reached.`;
            }
          }

          toast({
            title: `Mayur — ${stepNotif.sectionTitle}`,
            variant: stepNotif.ok ? "success" : "destructive",
            description,
          });
        },
      });

      if (result.usage) {
        setLastRunUsage(result.usage);
      }

      if (!result.ok) {
        const tokenNote =
          result.usage && result.usage.totalTokens > 0
            ? ` (${result.usage.totalTokens.toLocaleString()} tokens used: ${result.usage.inputTokens.toLocaleString()} prompt, ${result.usage.outputTokens.toLocaleString()} response)`
            : "";
        setTaskError((result.error || "Mayur could not complete this task.") + tokenNote);
        return;
      }

      setDialogOpen(false);
      const sectionMeta = getMayurSectionMeta(activeSection, currentValues.courtType);
      const displayLabel = activeCustomTitle || sectionMeta.title;

      if (activeSection === "master") {
        toast({
          title: "Master Mayur Complete",
          description: `${result.message || "All sections processed."} • Check the notification bell for section-by-section breakdown.`,
          action: (
            <ToastAction
              altText="Undo Master Mayur"
              onClick={() => {
                form.reset(preRunSnapshot, { keepDefaultValues: false });
                toast({ title: "Undone", description: "Restored all project fields to their pre-Mayur state." });
              }}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo All
            </ToastAction>
          ),
        });
      } else {
        toast({
          title: `Mayur updated ${displayLabel}`,
          description: `Applied ${result.opCount} field update${result.opCount === 1 ? "" : "s"}.`,
          action: (
            <ToastAction
              altText="Undo Mayur changes"
              onClick={() => {
                form.reset(preRunSnapshot, { keepDefaultValues: false });
                toast({ title: "Undone", description: `Restored fields to their state before Mayur updated ${displayLabel}.` });
              }}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
            </ToastAction>
          ),
        });
      }
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : String(err));
    } finally {
      if (offStream) offStream();
      setRunningTask(false);
    }
  };

  const currentCourtType = form.watch("courtType");
  const activeMeta = getMayurSectionMeta(activeSection, currentCourtType);
  const effectiveLabel = activeCustomTitle || activeMeta.title;
  const providerDisplay =
    provider === "gemini" ? "Google Gemini" : provider === "anthropic" ? "Claude (Anthropic)" : "ChatGPT (OpenAI)";

  return (
    <MayurContext.Provider
      value={{
        enabled,
        provider,
        model,
        contextDir,
        sourceLabel,
        scannedFiles,
        scanningRaw,
        partyRoleHint,
        setPartyRoleHint,
        scanSourceFiles,
        scanSourceFolder,
        clearRawMaterial,
        openMayurSettings,
        openTaskDialog,
      }}
    >
      {children}

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && runningTask) return; // prevent accidental close while streaming
          setDialogOpen(nextOpen);
        }}
      >
        <DialogContent className="mayur-dialog max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-2 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xs font-semibold pr-6">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">Mayur — {effectiveLabel}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeMode === "verbatim" ? (
                <>
                  Upload a single <code>.docx</code> or <code>.pdf</code> draft. Mayur will locate{" "}
                  <strong>{effectiveLabel}</strong> and copy its text verbatim into PaperBook&apos;s fields, preserving
                  bold, italics, underline, strikethrough, capitalization, numbered/bulleted lists, Word Heading
                  styles, table cells, and annexure references.
                </>
              ) : activeMode === "construct" ? (
                <>
                  Supply the case papers below. Mayur will read them thoroughly and construct{" "}
                  <strong>{effectiveLabel}</strong> according to PaperBook&apos;s court-specific drafting guidelines.
                </>
              ) : (
                <>
                  Mayur will read the List of Dates, Grounds, and other fields already entered in PaperBook and construct{" "}
                  <strong>{effectiveLabel}</strong> from them.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Mode Switcher Tabs inside Dialog */}
            <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
              <button
                type="button"
                disabled={runningTask}
                onClick={() => {
                  setActiveMode("verbatim");
                  setTaskError(null);
                }}
                className={cn(
                  "flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                  activeMode === "verbatim"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                [i] Import verbatim from draft
              </button>
              <button
                type="button"
                disabled={runningTask}
                onClick={() => {
                  setActiveMode("construct");
                  setTaskError(null);
                }}
                className={cn(
                  "flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                  activeMode === "construct"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                [ii] Construct from raw material
              </button>
              {activeMeta.supportsDeriveFromFields && (
                <button
                  type="button"
                  disabled={runningTask}
                  onClick={() => {
                    setActiveMode("derive");
                    setTaskError(null);
                  }}
                  className={cn(
                    "flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors text-left",
                    activeMode === "derive"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  [iii] From PaperBook fields
                </button>
              )}
            </div>

            {/* ── OPTION [i]: IMPORT VERBATIM FROM DRAFT ── */}
            {activeMode === "verbatim" && (
              <div className="space-y-2.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!runningTask) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    if (runningTask) return;
                    const paths = getDroppedFilePaths(e);
                    if (paths.length > 0) {
                      await loadVerbatimDraftFile(paths[0]);
                    }
                  }}
                  onClick={() => {
                    if (!runningTask && !extractingDraft) handleBrowseDraftFile();
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors",
                    isDragging
                      ? "border-primary bg-primary/10"
                      : draftFilePath
                        ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10"
                        : "border-muted-foreground/30 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
                  )}
                >
                  {extractingDraft ? (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p className="text-xs font-medium">Reading draft &amp; extracting rich formatting…</p>
                    </div>
                  ) : draftFilePath && draftFileName ? (
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{draftFileName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {draftFormat?.toUpperCase()} draft loaded (~{Math.max(1, Math.round(draftTokens / 1000))}k tokens with formatting tags) — click or drop to replace
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBrowseDraftFile();
                        }}
                      >
                        Change File
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <FileUp className="h-6 w-6 text-muted-foreground" />
                      <p className="text-xs font-medium">
                        Drag &amp; drop your draft file here, or <span className="text-primary underline">click to browse</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Accepts a single <strong>.docx</strong> or <strong>.pdf</strong> file containing the drafted {effectiveLabel}
                      </p>
                    </div>
                  )}
                </div>

                {draftExtractError && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {draftExtractError}
                  </p>
                )}

                <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">What Mayur preserves verbatim:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Exact wording, capitalization, <b>bold</b>, <i>italics</i>, <u>underline</u>, Strikethrough, and nested lists.</li>
                    {activeSection === "lod" || activeSection === "master" ? (
                      <li>
                        <strong>List of Dates &amp; Annexures:</strong> Places each table cell into PaperBook&apos;s Date &amp; Particulars rows and automatically extracts Annexure sentences into PaperBook&apos;s Annexure Dialog.
                      </li>
                    ) : null}
                    {activeSection === "grounds" || activeSection === "qol" || activeSection === "master" ? (
                      <li>
                        <strong>Grounds / Questions of Law:</strong> Splits each numbered/lettered ground into its own PaperBook row and converts Word Heading styles (from <code>.docx</code>) into Ground Heading rows.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            )}

            {/* ── OPTION [ii]: CONSTRUCT FROM RAW MATERIAL ── */}
            {activeMode === "construct" && (
              <div className="space-y-3">
                {/* Advisory banner requested by the user */}
                <div className="rounded-md border border-amber-300 bg-amber-50/90 p-2.5 dark:border-amber-700/60 dark:bg-amber-950/30">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" /> Recommended Case Material
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200/90">
                    For best results, please ensure that the <strong>Impugned Judgment(s) or Order(s)</strong> as well as
                    the <strong>complete High Court / lower-court paperbook</strong> (pleadings, FIR/plaint, depositions,
                    orders, and annexures) are supplied.
                  </p>
                </div>

                {/* Drag-and-drop zone + File/Folder buttons */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!runningTask && !scanningRaw) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    if (runningTask || scanningRaw) return;
                    const paths = getDroppedFilePaths(e);
                    if (paths.length > 0) {
                      await scanSourceFiles(paths);
                    }
                  }}
                  className={cn(
                    "rounded-lg border-2 border-dashed p-3.5 transition-colors",
                    isDragging
                      ? "border-primary bg-primary/10"
                      : scannedFiles.length > 0
                        ? "border-green-500/40 bg-green-500/5"
                        : "border-muted-foreground/30 bg-muted/20"
                  )}
                >
                  {scanningRaw ? (
                    <div className="flex flex-col items-center gap-1.5 py-3 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p className="text-xs font-medium">Scanning case material…</p>
                      <p className="text-[11px] text-muted-foreground">
                        Extracting text and running OCR on scanned pages if needed…
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-col items-center gap-1 text-center">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <p className="text-xs font-medium">
                          Drag &amp; drop <strong>.pdf</strong> or <strong>.docx</strong> files here
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Or use the buttons below to select files or an entire case folder from your disk
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          disabled={runningTask}
                          onClick={handleBrowseRawFiles}
                        >
                          <FileText className="h-3.5 w-3.5" /> Select Files (.pdf / .docx)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          disabled={runningTask}
                          onClick={handleBrowseRawFolder}
                        >
                          <FolderOpen className="h-3.5 w-3.5" /> Select Folder
                        </Button>
                        {scannedFiles.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                            disabled={runningTask}
                            onClick={clearRawMaterial}
                            title="Clear loaded case material"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scanned Files Summary */}
                {scannedFiles.length > 0 && !scanningRaw && (
                  <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-1.5 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {sourceLabel} ({scannedFiles.length} file{scannedFiles.length === 1 ? "" : "s"} ready)
                      </span>
                      <span className="text-[10px] text-muted-foreground">Shared across all Mayur buttons</span>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {scannedFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] rounded bg-background/80 px-2 py-1 border">
                          <span className="truncate font-medium max-w-[320px]" title={f.name}>
                            {f.name}
                          </span>
                          <span className="text-muted-foreground shrink-0 ml-2">
                            {f.error ? (
                              <span className="text-destructive">{f.error}</span>
                            ) : (
                              <>
                                {f.pageCount > 0 ? `${f.pageCount} page${f.pageCount === 1 ? "" : "s"}` : "Ready"}
                                {f.scannedPages?.length ? ` (${f.scannedPages.length} scanned)` : ""}
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Party Role Selector & Optional Guidance */}
                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Who do we represent?</Label>
                    <Select value={partyRoleHint} onValueChange={setPartyRoleHint} disabled={runningTask}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto" className="text-xs">Auto-detect from Impugned Order</SelectItem>
                        <SelectItem value="petitioner" className="text-xs">Aggrieved Petitioner / Appellant</SelectItem>
                        <SelectItem value="respondent" className="text-xs">Respondent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Specific focus / instructions (optional)</Label>
                    <Input
                      value={userHint}
                      onChange={(e) => setUserHint(e.target.value)}
                      disabled={runningTask}
                      placeholder="e.g. Focus on Section 34 IPC & delay"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── OPTION [iii]: DERIVE FROM EXISTING DRAFTO FIELDS ── */}
            {activeMode === "derive" && (
              <div className="space-y-2.5">
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
                  Mayur will inspect the sections you have already filled in PaperBook (such as the{" "}
                  <strong>List of Dates</strong>, <strong>Grounds</strong>, <strong>Memo of Parties</strong>, and{" "}
                  <strong>Impugned Order details</strong>) and construct <strong>{effectiveLabel}</strong> without
                  needing any external files.
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Optional instructions for Mayur</Label>
                  <Input
                    value={userHint}
                    onChange={(e) => setUserHint(e.target.value)}
                    disabled={runningTask}
                    placeholder="e.g. Keep the Synopsis under 2 pages"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Optional note for Verbatim mode */}
            {activeMode === "verbatim" && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Optional note (e.g. if the draft has multiple sections)</Label>
                <Input
                  value={userHint}
                  onChange={(e) => setUserHint(e.target.value)}
                  disabled={runningTask}
                  placeholder="Optional — leave blank to import the entire section verbatim"
                  className="h-7 text-xs"
                />
              </div>
            )}

            {/* Live Progress / Error Box */}
            {runningTask && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{statusMessage || "Mayur is working…"}</span>
                    {liveUsage && (
                      <span className="text-[10px] text-muted-foreground">
                        {liveUsage.total.toLocaleString()} tokens ({liveUsage.input.toLocaleString()} prompt + {liveUsage.output.toLocaleString()} generated)
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] shrink-0"
                  onClick={handleStopTask}
                >
                  <Square className="h-3 w-3" /> Stop
                </Button>
              </div>
            )}

            {taskError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1.5">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 max-h-36 overflow-y-auto pr-1">
                    <span className="leading-relaxed font-mono text-[11px] whitespace-pre-wrap break-words">{taskError}</span>
                  </div>
                </div>
                {lastRunUsage && lastRunUsage.totalTokens > 0 && !taskError.includes("tokens used") && (
                  <div className="text-[11px] text-destructive/80 pl-5">
                    Tokens consumed before failure: {lastRunUsage.totalTokens.toLocaleString()} ({lastRunUsage.inputTokens.toLocaleString()} prompt, {lastRunUsage.outputTokens.toLocaleString()} response)
                  </div>
                )}
                {taskError.toLowerCase().includes("api key") && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <strong className="text-foreground font-semibold">Tip:</strong> To use Mayur for free, get a free Gemini API key in 10 seconds from{" "}
                      <button
                        type="button"
                        onClick={() => {
                          const url = "https://aistudio.google.com/app/apikey";
                          if (window.electron?.openExternal) window.electron.openExternal(url);
                          else window.open(url, "_blank");
                        }}
                        className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        Google AI Studio (aistudio.google.com)
                      </button>{" "}
                      using your regular Google/Gmail account — no credit card or billing details required.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] gap-1"
                      onClick={openMayurSettings}
                    >
                      <Settings2 className="h-3 w-3" /> Configure API Key in Settings
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="p-3 px-4 border-t bg-muted/20 shrink-0 flex items-center justify-between sm:justify-between gap-2">
            <button
              type="button"
              onClick={openMayurSettings}
              disabled={runningTask}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Change AI provider, API key, or model"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>
                {providerDisplay} · <code className="text-[10px]">{model}</code>
              </span>
            </button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={runningTask}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={
                  runningTask ||
                  scanningRaw ||
                  extractingDraft ||
                  (activeMode === "verbatim" && !draftFilePath) ||
                  (activeMode === "construct" && (!contextDir || scannedFiles.length === 0))
                }
                onClick={handleRunMayur}
              >
                {runningTask ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running Mayur…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {activeMode === "verbatim"
                      ? `Import ${effectiveLabel}`
                      : activeMode === "construct"
                        ? `Construct ${effectiveLabel}`
                        : `Generate ${effectiveLabel}`}
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MayurContext.Provider>
  );
}

export interface MayurButtonProps {
  section: MayurSectionId;
  /** Optional custom title override (e.g. for custom IAs / CMs / MAs) */
  label?: string;
  /** Visual variant: 'heading' sits next to section headings; 'master' sits in the top header bar */
  variant?: "heading" | "master";
  className?: string;
}

export function MayurButton({
  section,
  label,
  variant = "heading",
  className,
}: MayurButtonProps) {
  const ctx = useContext(MayurContext);
  const form = useFormContext<DraftoProject>();

  if (!ctx || !ctx.enabled) return null;

  const courtType = form.watch("courtType");
  const meta = getMayurSectionMeta(section, courtType);
  const displayTitle = label || meta.title;
  const providerShort =
    ctx.provider === "gemini" ? "Gemini" : ctx.provider === "anthropic" ? "Claude" : "OpenAI";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "master" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary font-medium text-xs shadow-sm",
              className
            )}
            title="Master Mayur — Auto-fill all sections of this project from a draft or raw case material"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Mayur</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-6 gap-1 px-2 text-[11px] font-medium border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 hover:text-primary transition-colors shrink-0",
              className
            )}
            title={`Use Mayur AI to populate ${displayTitle}`}
          >
            <Sparkles className="h-3 w-3 shrink-0" />
            <span>Mayur</span>
            <ChevronDown className="h-2.5 w-2.5 opacity-70" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">Mayur — {displayTitle}</span>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
          onSelect={() =>
            ctx.openTaskDialog({
              section,
              mode: "verbatim",
              customTitle: label,
            })
          }
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <FileUp className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>[i] Import verbatim from draft</span>
          </div>
          <span className="pl-5 text-[11px] text-muted-foreground leading-snug">
            Upload a .docx or .pdf draft &amp; copy {section === "master" ? "all sections" : "this section"} with formatting
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
          onSelect={() =>
            ctx.openTaskDialog({
              section,
              mode: "construct",
              customTitle: label,
            })
          }
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>[ii] Construct from raw material</span>
          </div>
          <span className="pl-5 text-[11px] text-muted-foreground leading-snug">
            Read Impugned Order(s) &amp; lower-court paperbook to draft {section === "master" ? "everything" : "this section"}
          </span>
        </DropdownMenuItem>

        {meta.supportsDeriveFromFields && (
          <DropdownMenuItem
            className="cursor-pointer flex flex-col items-start gap-0.5 py-2"
            onSelect={() =>
              ctx.openTaskDialog({
                section,
                mode: "derive",
                customTitle: label,
              })
            }
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>[iii] Construct from PaperBook fields</span>
            </div>
            <span className="pl-5 text-[11px] text-muted-foreground leading-snug">
              {meta.deriveHint || "Draft directly from the List of Dates & Grounds already in PaperBook"}
            </span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer flex items-center justify-between py-1.5 text-[11px] text-muted-foreground"
          onSelect={() => ctx.openMayurSettings()}
        >
          <span>
            {providerShort} · {ctx.model}
          </span>
          <span className="inline-flex items-center gap-1 text-primary">
            <Settings2 className="h-3 w-3" /> Settings
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

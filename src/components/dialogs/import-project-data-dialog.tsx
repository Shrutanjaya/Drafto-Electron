"use client";

import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FileUp,
  FolderOpen,
  CheckCircle2,
  Calendar,
  FileText,
  Users,
  Scale,
  Landmark,
  Building2,
  Loader2,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  type ImportDataOptions,
  getDocumentTypeOption,
  getForumForCourtType,
} from "@/lib/court-family";
import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { restoreFileFromPath } from "@/lib/utils/pick-file";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ImportProjectDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTargetProject: DraftoProject;
  onImport: (sourceProject: DraftoProject, options: ImportDataOptions) => void;
}

export function ImportProjectDataDialog({
  open,
  onOpenChange,
  currentTargetProject,
  onImport,
}: ImportProjectDataDialogProps) {
  const [sourceProject, setSourceProject] = useState<DraftoProject | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Selection state
  const [importDates, setImportDates] = useState(true);
  const [datesMode, setDatesMode] = useState<"append" | "replace">("append");
  const [importParties, setImportParties] = useState(true);
  const [importFacts, setImportFacts] = useState(true);
  const [importGrounds, setImportGrounds] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setSourceProject(null);
    setSourceFileName(null);
    setIsLoading(false);
    setImportDates(true);
    setDatesMode("append");
    setImportParties(true);
    setImportFacts(true);
    setImportGrounds(false);
  };

  React.useEffect(() => {
    if (!open) resetState();
  }, [open]);

  const processLoadedContent = async (rawJson: string, fileName: string) => {
    setIsLoading(true);
    try {
      const parsed = JSON.parse(rawJson);
      const validated = draftoProjectSchema.parse(parsed);

      // Restore attached File objects from disk paths in Electron
      if (window.electron?.readFileByPath && validated.listOfDates) {
        for (const row of validated.listOfDates) {
          for (const annex of row.annexures || []) {
            if (annex.filePath && !(annex.file instanceof File)) {
              annex.file = await restoreFileFromPath(annex.filePath);
            }
            for (const collyDoc of annex.collyDocuments || []) {
              if (collyDoc.filePath && !(collyDoc.file instanceof File)) {
                collyDoc.file = await restoreFileFromPath(collyDoc.filePath);
              }
            }
          }
        }
      }

      setSourceProject(validated);
      setSourceFileName(fileName);
    } catch (err) {
      console.error("Failed to parse source project:", err);
      toast({
        variant: "destructive",
        title: "Invalid Project File",
        description: "The selected file could not be parsed as a valid Drafto project.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBrowseElectron = async () => {
    if (!window.electron?.openDraftoFileDialog || !window.electron?.loadProjectFromPath) {
      fileInputRef.current?.click();
      return;
    }
    const filePath = await window.electron.openDraftoFileDialog();
    if (!filePath) return;
    setIsLoading(true);
    try {
      const content = await window.electron.loadProjectFromPath(filePath);
      const fileName = filePath.split(/[\\/]/).pop() || "Project";
      await processLoadedContent(content, fileName);
    } catch (err) {
      console.error("Error reading file:", err);
      toast({
        variant: "destructive",
        title: "Could not open file",
        description: String(err),
      });
      setIsLoading(false);
    }
  };

  const handleWebFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      await processLoadedContent(text, file.name);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      await processLoadedContent(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!sourceProject) return;
    onImport(sourceProject, {
      importDates,
      datesMode,
      importParties,
      importFacts,
      importGrounds,
    });
    onOpenChange(false);
  };

  // Source stats
  const sourceCt = sourceProject?.courtType ?? "SLP";
  const sourceOption = getDocumentTypeOption(sourceCt);
  const targetForum = getForumForCourtType(currentTargetProject.courtType);
  const sourceForum = getForumForCourtType(sourceCt);

  const datesCount = (sourceProject?.listOfDates || []).filter(
    (d) => d.date?.trim() || d.event?.trim() || (d.annexures && d.annexures.length > 0)
  ).length;
  const annexCount = (sourceProject?.listOfDates || []).reduce(
    (acc, d) => acc + (d.annexures?.length || 0),
    0
  );
  const collyCount = (sourceProject?.listOfDates || []).reduce(
    (acc, d) => acc + (d.annexures?.filter((a) => a.isColly)?.length || 0),
    0
  );
  const petNames = (sourceProject?.petitioners || []).filter((p) => p.name?.trim()).map((p) => p.name);
  const respNames = (sourceProject?.respondents || []).filter((r) => r.name?.trim()).map((r) => r.name);
  const groundsCount = (sourceProject?.grounds || []).filter((g) => g.particulars?.trim() || g.heading?.trim()).length;
  const hasNarrative = Boolean(sourceProject?.synopsis || sourceProject?.wp?.facts || sourceProject?.oa?.facts);

  const canImport = Boolean(
    sourceProject && (
      (importDates && datesCount > 0) ||
      (importParties && (petNames.length > 0 || respNames.length > 0)) ||
      (importFacts && hasNarrative) ||
      (importGrounds && groundsCount > 0)
    )
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <FileUp className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Import Data from Another Project</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Pull List of Dates, attached PDFs, Parties, or Facts narrative from any existing draft without re-typing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          {/* File Selection / Empty State */}
          {!sourceProject ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-lg border-2 border-dashed p-8 text-center transition-colors flex flex-col items-center justify-center gap-3",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs font-semibold text-muted-foreground">Loading and restoring project data…</p>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Select an existing Drafto project file</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Supports .drafto, .scappeal, .scwp, .scpil, .dhcwp, and .catoa files
                    </p>
                  </div>
                  <Button size="sm" onClick={handleBrowseElectron} className="gap-1.5 font-semibold">
                    <FolderOpen className="h-4 w-4" />
                    Browse Project File…
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* Loaded Project Summary & Selection */
            <div className="space-y-4">
              {/* Source Details Card */}
              <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      {sourceOption.forumName}
                    </Badge>
                    <span className="text-xs font-bold text-foreground">{sourceOption.label}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSourceProject(null)} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                    Choose different file
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground truncate font-mono bg-background/50 rounded px-2 py-1 border">
                  📂 {sourceFileName}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary" /> {datesCount} Dates/Events
                  </span>
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <FileText className="h-3.5 w-3.5 text-primary" /> {annexCount} Annexures
                  </span>
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Users className="h-3.5 w-3.5 text-primary" /> {petNames.length + respNames.length} Parties
                  </span>
                </div>
              </div>

              {/* What to import checklist */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Choose Data to Import into Active Draft:
                </label>

                {/* 1. List of Dates */}
                <div className="rounded-lg border p-3 space-y-2.5 bg-card">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="import-dates"
                      checked={importDates}
                      onCheckedChange={(c) => setImportDates(Boolean(c))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label htmlFor="import-dates" className="text-xs font-bold text-foreground cursor-pointer flex items-center gap-2">
                        <span>List of Dates & Events</span>
                        <Badge variant="outline" className="text-[9px] py-0 font-normal">
                          {datesCount} entries ({annexCount} attached PDFs)
                        </Badge>
                      </label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Transfers dates, chronological particulars, and attached PDF documents.
                      </p>
                    </div>
                  </div>

                  {importDates && (
                    <div className="pl-6 pt-1">
                      <RadioGroup
                        value={datesMode}
                        onValueChange={(v) => setDatesMode(v as "append" | "replace")}
                        className="flex flex-row gap-4"
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="append" id="dates-append" />
                          <label htmlFor="dates-append" className="text-xs cursor-pointer text-foreground">
                            Append to current dates
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="replace" id="dates-replace" />
                          <label htmlFor="dates-replace" className="text-xs cursor-pointer text-foreground">
                            Replace current dates
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </div>

                {/* 2. Parties */}
                <div className="rounded-lg border p-3 bg-card flex items-start gap-2.5">
                  <Checkbox
                    id="import-parties"
                    checked={importParties}
                    onCheckedChange={(c) => setImportParties(Boolean(c))}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label htmlFor="import-parties" className="text-xs font-bold text-foreground cursor-pointer flex items-center gap-2">
                      <span>Parties (Petitioners & Respondents)</span>
                      <Badge variant="outline" className="text-[9px] py-0 font-normal">
                        {petNames.length + respNames.length} parties
                      </Badge>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {petNames[0] || "Petitioner"} {respNames[0] ? `v. ${respNames[0]}` : ""}
                    </p>
                  </div>
                </div>

                {/* 3. Facts / Synopsis */}
                <div className="rounded-lg border p-3 bg-card flex items-start gap-2.5">
                  <Checkbox
                    id="import-facts"
                    checked={importFacts}
                    onCheckedChange={(c) => setImportFacts(Boolean(c))}
                    className="mt-0.5"
                    disabled={!hasNarrative}
                  />
                  <div className="flex-1">
                    <label htmlFor="import-facts" className={cn("text-xs font-bold text-foreground cursor-pointer flex items-center gap-2", !hasNarrative && "opacity-60")}>
                      <span>Factual Narrative / Synopsis</span>
                      {!hasNarrative && (
                        <span className="text-[10px] text-muted-foreground italic">(None in source file)</span>
                      )}
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Copies background facts into the current draft's Synopsis/Facts section.
                    </p>
                  </div>
                </div>

                {/* 4. Grounds (Optional) */}
                <div className="rounded-lg border p-3 bg-card flex items-start gap-2.5">
                  <Checkbox
                    id="import-grounds"
                    checked={importGrounds}
                    onCheckedChange={(c) => setImportGrounds(Boolean(c))}
                    className="mt-0.5"
                    disabled={groundsCount === 0}
                  />
                  <div className="flex-1">
                    <label htmlFor="import-grounds" className={cn("text-xs font-bold text-foreground cursor-pointer flex items-center gap-2", groundsCount === 0 && "opacity-60")}>
                      <span>Grounds of Challenge</span>
                      <Badge variant="outline" className="text-[9px] py-0 font-normal">
                        {groundsCount} grounds
                      </Badge>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Transfers legal grounds from the source draft.
                    </p>
                  </div>
                </div>
              </div>

              {/* Colly notice if importing from DHC into SC/CAT */}
              {importDates && (targetForum === "SC" || targetForum === "CAT") && sourceForum === "DHC" && collyCount > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 p-2.5 text-xs text-blue-900 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <span>
                    <strong>Supreme Court Compliance:</strong> {collyCount} Colly annexure(s) in this High Court file will be unbundled into separate individual annexures so your Supreme Court paper-book remains completely free of registry defects.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleWebFile}
          accept=".drafto,.scappeal,.scwp,.scpil,.dhcwp,.catoa"
          className="hidden"
        />

        <DialogFooter className="gap-2 sm:gap-0 shrink-0 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {sourceProject && (
            <Button
              size="sm"
              onClick={handleConfirmImport}
              disabled={!canImport}
              className="gap-1.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileUp className="h-3.5 w-3.5" />
              Import Selected Data
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  OctagonAlert,
  Info,
  Loader2,
  X,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PaperbookItemStatus =
  | "mandatory_missing" // Red: Upload button, tooltip "Please upload a PDF here."
  | "optional_missing"  // Yellow: Upload button, tooltip "Please upload a PDF here (Optional)."
  | "user_uploaded"     // Green: Ready button, tooltip "File uploaded, click to replace: <filename>."
  | "auto_ready"        // Green: Ready button, tooltip "Click to replace"
  | "auto_frozen";      // Green: Ready button, tooltip "File frozen, cannot be replaced"

export interface PaperbookNote {
  text: string;
  type?: "info" | "warning" | "error";
}

export interface PaperbookItem {
  id: string;
  label?: string;
  sNo: string | number;
  particulars: React.ReactNode;
  notes?: (string | PaperbookNote)[];
  tooltip?: React.ReactNode;
  status: PaperbookItemStatus;
  fileName?: string;
  lockedTooltip?: string;
  onUpload?: () => void;
  onRemove?: () => void;
  extra?: React.ReactNode;
}

export interface PaperbookSectionData {
  key: "initial" | "annexures" | "tail";
  label: string;
  rows: PaperbookItem[];
}

export interface PaperbookGeneratorViewProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  sections: {
    initial: PaperbookItem[];
    annexures: PaperbookItem[];
    tail: PaperbookItem[];
  };
  customOptions?: React.ReactNode;
  ocr?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  };
  isGenerating?: boolean;
  progressPercent?: number | null;
  progressLabel?: string | null;
  isProcessingOcr?: boolean;
  canExport?: boolean;
  exportPermissionMessage?: React.ReactNode;
  onBack?: () => void;
  onGo: () => void;
  missingMandatoryLabels?: string[];
  maxHeight?: string;
}

function ItemInfoTooltip({ item }: { item: PaperbookItem }) {
  const hasCustomTooltip = !!item.tooltip;
  const notes = item.notes || [];
  if (!hasCustomTooltip && notes.length === 0) return null;

  const hasError = notes.some((n) => typeof n !== "string" && n.type === "error");
  const hasWarning = !hasError && notes.some((n) => typeof n !== "string" && n.type === "warning");

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center justify-center cursor-pointer p-0.5 rounded-full hover:bg-muted transition-colors shrink-0",
              hasError
                ? "text-destructive hover:bg-destructive/10"
                : hasWarning
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-blue-500/80 hover:text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            )}
            aria-label="Item information"
          >
            {hasError ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : hasWarning ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Info className="h-3.5 w-3.5" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px] text-xs p-2.5">
          {item.tooltip ? (
            item.tooltip
          ) : (
            <div className="space-y-1.5">
              {notes.map((n, idx) => {
                const text = typeof n === "string" ? n : n.text;
                const type = typeof n === "string" ? "info" : n.type || "info";
                return (
                  <div key={idx} className="flex items-start gap-1.5 leading-snug">
                    {type === "error" ? (
                      <OctagonAlert className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                    ) : type === "warning" ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                    ) : (
                      <Info className="h-3.5 w-3.5 shrink-0 text-blue-400 mt-0.5" />
                    )}
                    <span
                      className={cn(
                        type === "error" && "text-destructive font-medium",
                        type === "warning" && "text-amber-600 dark:text-amber-400",
                        type === "info" && "text-foreground"
                      )}
                    >
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActionPill({ item }: { item: PaperbookItem }) {
  switch (item.status) {
    case "mandatory_missing":
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={item.onUpload}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border leading-tight select-none cursor-pointer border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
              >
                <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                <span>Upload</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              Required document. Click to upload PDF.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

    case "optional_missing":
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={item.onUpload}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border leading-tight select-none cursor-pointer border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20"
              >
                <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                <span>Upload</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              Optional document. Click to upload PDF.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

    case "user_uploaded":
    case "auto_ready":
      return (
        <div className="inline-flex items-center gap-0.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onUpload}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border leading-tight select-none cursor-pointer border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                >
                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                  <span>Ready</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs">
                {item.status === "user_uploaded"
                  ? `File uploaded: ${item.fileName || "Attached"}. Click to replace.`
                  : "Auto-generated document. Click to replace with your own file."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {item.onRemove && (
            <button
              type="button"
              onClick={item.onRemove}
              title="Remove attached file"
              aria-label="Remove attached file"
              className="h-4 w-4 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      );

    case "auto_frozen":
    default:
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border leading-tight select-none border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 opacity-90 cursor-default">
                <Lock className="h-2.5 w-2.5 shrink-0" />
                <span>Ready</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              {item.lockedTooltip || "File frozen, cannot be replaced"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
  }
}

export function PaperbookGeneratorView({
  children,
  open,
  onOpenChange,
  title = "Paperbook Generator",
  description = "Review all components and upload annexures/affidavits. The final PDF will be merged in the order below.",
  sections,
  customOptions,
  ocr,
  isGenerating = false,
  progressPercent = null,
  progressLabel = null,
  isProcessingOcr = false,
  canExport = true,
  exportPermissionMessage,
  onBack,
  onGo,
  missingMandatoryLabels,
}: PaperbookGeneratorViewProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);
  const [leftWrap, setLeftWrap] = useState(true);
  const [rightWrap, setRightWrap] = useState(true);
  const [annexFilter, setAnnexFilter] = useState<"all" | "pending">("all");

  const allItems = useMemo(
    () => [...sections.initial, ...sections.annexures, ...sections.tail],
    [sections.initial, sections.annexures, sections.tail]
  );

  const mandatoryMissing = useMemo(
    () => allItems.filter((it) => it.status === "mandatory_missing"),
    [allItems]
  );
  const optionalMissing = useMemo(
    () => allItems.filter((it) => it.status === "optional_missing"),
    [allItems]
  );

  const missingList = useMemo(
    () =>
      missingMandatoryLabels && missingMandatoryLabels.length > 0
        ? missingMandatoryLabels
        : mandatoryMissing.map(
            (it) =>
              it.label ||
              (typeof it.particulars === "string" ? it.particulars : `S. No. ${it.sNo}`)
          ),
    [missingMandatoryLabels, mandatoryMissing]
  );

  const isGoDisabled = isGenerating || isProcessingOcr || !canExport;

  const handleGoClick = () => {
    if (missingList.length > 0) {
      setShowIncompleteWarning(true);
    } else {
      onGo();
    }
  };

  const overallStatus =
    mandatoryMissing.length > 0
      ? "mandatory"
      : optionalMissing.length > 0
      ? "optional"
      : "ready";

  const STATUS_META = {
    ready: {
      label: "Ready",
      cls: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
      dot: "bg-green-500",
    },
    mandatory: {
      label: "Not Ready",
      cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
      dot: "bg-red-500",
    },
    optional: {
      label: "Optional pending",
      cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
      dot: "bg-yellow-500",
    },
  } as const;

  const StatusChip = ({ status }: { status: "ready" | "mandatory" | "optional" }) => (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0",
        STATUS_META[status].cls
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
      {STATUS_META[status].label}
    </span>
  );

  const handleCloseAttempt = () => {
    if (isGenerating || isProcessingOcr) {
      setShowCancelConfirm(true);
      return;
    }
    if (onBack) onBack();
    else onOpenChange(false);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    if (onBack) onBack();
    else onOpenChange(false);
  };

  const pendingAnnexures = useMemo(
    () =>
      sections.annexures.filter(
        (it) => it.status === "mandatory_missing" || it.status === "optional_missing"
      ),
    [sections.annexures]
  );

  const visibleAnnexures = useMemo(() => {
    if (annexFilter === "pending") return pendingAnnexures;
    return sections.annexures;
  }, [annexFilter, pendingAnnexures, sections.annexures]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && (isGenerating || isProcessingOcr)) {
            setShowCancelConfirm(true);
            return;
          }
          onOpenChange(nextOpen);
        }}
      >
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">{description}</DialogDescription>
          </DialogHeader>

          {/* Readiness summary banner */}
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs shrink-0 mt-1",
              overallStatus === "mandatory"
                ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400"
                : overallStatus === "optional"
                ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400"
                : "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
            )}
          >
            <span className="font-medium flex items-center gap-1.5 truncate">
              {overallStatus === "mandatory" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              ) : overallStatus === "optional" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              )}
              <span className="truncate">
                {overallStatus === "mandatory"
                  ? `Not ready — ${mandatoryMissing.length} item${
                      mandatoryMissing.length === 1 ? "" : "s"
                    } needed before you can generate.`
                  : overallStatus === "optional"
                  ? `Ready to generate — ${optionalMissing.length} optional upload${
                      optionalMissing.length === 1 ? "" : "s"
                    } still pending.`
                  : "All set — ready to generate."}
              </span>
            </span>
            <StatusChip status={overallStatus} />
          </div>

          {/* 2-Column Side-by-Side Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow min-h-0 pt-2">
            {/* Left Column: Pleadings & Applications */}
            <div className="flex flex-col border rounded-lg bg-card overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">Pleadings & Applications</span>
                  <span className="text-[11px] font-normal text-muted-foreground px-1.5 py-0.2 rounded-full bg-muted border">
                    {sections.initial.length + sections.tail.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLeftWrap((w) => !w)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title={leftWrap ? "Switch to horizontal scroll" : "Switch to text wrapping"}
                >
                  {leftWrap ? "Wrap" : "Scroll"}
                </button>
              </div>

              <ScrollArea className="flex-grow h-[46vh] pr-2">
                <div className="p-1 space-y-3">
                  {/* Initial items */}
                  {sections.initial.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/20 rounded">
                        Main Pleadings
                      </div>
                      <div className="divide-y divide-border/40">
                        {sections.initial.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2 p-2 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start gap-2 min-w-0 flex-grow">
                              <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5 w-5 text-right">
                                {item.sNo}
                              </span>
                              <div
                                className={cn(
                                  "text-xs min-w-0 flex-grow",
                                  leftWrap ? "whitespace-normal break-words leading-snug" : "whitespace-nowrap"
                                )}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-foreground">{item.particulars}</span>
                                  <ItemInfoTooltip item={item} />
                                </div>
                                {item.extra && <div className="mt-1">{item.extra}</div>}
                              </div>
                            </div>
                            <div className="shrink-0 pt-0.5">
                              <ActionPill item={item} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tail items */}
                  {sections.tail.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 bg-muted/20 rounded">
                        Applications & Tail Documents
                      </div>
                      <div className="divide-y divide-border/40">
                        {sections.tail.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-2 p-2 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start gap-2 min-w-0 flex-grow">
                              <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5 w-5 text-right">
                                {item.sNo}
                              </span>
                              <div
                                className={cn(
                                  "text-xs min-w-0 flex-grow",
                                  leftWrap ? "whitespace-normal break-words leading-snug" : "whitespace-nowrap"
                                )}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-foreground">{item.particulars}</span>
                                  <ItemInfoTooltip item={item} />
                                </div>
                                {item.extra && <div className="mt-1">{item.extra}</div>}
                              </div>
                            </div>
                            <div className="shrink-0 pt-0.5">
                              <ActionPill item={item} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {!leftWrap && <ScrollBar orientation="horizontal" />}
              </ScrollArea>
            </div>

            {/* Right Column: Annexures */}
            <div className="flex flex-col border rounded-lg bg-card overflow-hidden min-h-0">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide">Annexures</span>
                  <span className="text-[11px] font-normal text-muted-foreground px-1.5 py-0.2 rounded-full bg-muted border">
                    {sections.annexures.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Filter toggle: All vs Pending */}
                  <div className="flex items-center rounded-md border p-0.5 text-[11px] bg-background">
                    <button
                      type="button"
                      onClick={() => setAnnexFilter("pending")}
                      className={cn(
                        "px-2 py-0.5 rounded transition-colors cursor-pointer",
                        annexFilter === "pending"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Pending ({pendingAnnexures.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnnexFilter("all")}
                      className={cn(
                        "px-2 py-0.5 rounded transition-colors cursor-pointer",
                        annexFilter === "all"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All ({sections.annexures.length})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightWrap((w) => !w)}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    title={rightWrap ? "Switch to horizontal scroll" : "Switch to text wrapping"}
                  >
                    {rightWrap ? "Wrap" : "Scroll"}
                  </button>
                </div>
              </div>

              <ScrollArea className="flex-grow h-[46vh] pr-2">
                <div className="p-1 divide-y divide-border/40">
                  {visibleAnnexures.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 p-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-grow">
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5 w-6 text-right">
                          {item.sNo}
                        </span>
                        <div
                          className={cn(
                            "text-xs min-w-0 flex-grow",
                            rightWrap ? "whitespace-normal break-words leading-snug" : "whitespace-nowrap"
                          )}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-foreground">{item.particulars}</span>
                            <ItemInfoTooltip item={item} />
                          </div>
                          {item.extra && <div className="mt-1">{item.extra}</div>}
                        </div>
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <ActionPill item={item} />
                      </div>
                    </div>
                  ))}

                  {visibleAnnexures.length === 0 && (
                    <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-muted-foreground text-xs gap-1.5">
                      <CheckCircle2 className="h-6 w-6 text-green-500/80 mb-0.5" />
                      <span className="font-semibold text-foreground text-sm">
                        {annexFilter === "pending" ? "All annexures uploaded" : "No annexures in this case"}
                      </span>
                      {annexFilter === "pending" && (
                        <span className="text-xs text-muted-foreground">Every annexure copy has been attached.</span>
                      )}
                    </div>
                  )}
                </div>
                {!rightWrap && <ScrollBar orientation="horizontal" />}
              </ScrollArea>
            </div>
          </div>

          {/* Bottom Options & Controls */}
          <div className="mt-3 border-t pt-2 space-y-2 shrink-0">
            {customOptions}

            {ocr && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="paperbook-enable-ocr"
                  checked={ocr.checked}
                  onCheckedChange={(checked) => ocr.onChange(checked as boolean)}
                  disabled={ocr.disabled || isGenerating}
                />
                <label
                  htmlFor="paperbook-enable-ocr"
                  className="text-xs font-medium cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Run OCR on the merged PDF (makes scanned pages text-searchable; takes longer)
                </label>
              </div>
            )}

            {(isGenerating || isProcessingOcr) && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />{" "}
                {isProcessingOcr
                  ? "Running OCR…"
                  : progressLabel || (progressPercent !== null ? `Generating ${progressPercent}%…` : "Generating…")}
              </p>
            )}

            {exportPermissionMessage && (
              <div className="text-[11px] text-destructive">
                {exportPermissionMessage}
              </div>
            )}
          </div>

          {/* Dialog Footer */}
          <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2 shrink-0 border-t">
            <div className="text-[11px] text-muted-foreground">
              {overallStatus === "ready" && "All set — ready to generate."}
              {overallStatus === "mandatory" && `${mandatoryMissing.length} required file(s) missing`}
              {overallStatus === "optional" && `${optionalMissing.length} optional file(s) unattached`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCloseAttempt}
                className="text-xs h-8 cursor-pointer"
              >
                Back
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleGoClick}
                disabled={isGoDisabled}
                className="text-xs h-8 cursor-pointer"
              >
                {(isGenerating || isProcessingOcr) && (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                )}
                {isProcessingOcr
                  ? "Processing OCR..."
                  : isGenerating
                  ? progressPercent !== null
                    ? `Generating ${progressPercent}%`
                    : "Generating…"
                  : "Generate PDF Paperbook"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {missingList.map((label, idx) => (
                <li key={idx} className="text-foreground leading-snug">
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs font-medium text-foreground">Do you wish to proceed anyway?</p>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowIncompleteWarning(false)}
              className="text-xs h-8 cursor-pointer"
            >
              No
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowIncompleteWarning(false);
                onGo();
              }}
              className="text-xs h-8 cursor-pointer"
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PDF Generation in Progress</AlertDialogTitle>
            <AlertDialogDescription>
              This action will terminate the PDF generation process. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCancelConfirm(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

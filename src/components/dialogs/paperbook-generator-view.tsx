"use client";

import React, { useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronRight,
  Upload,
  CheckCircle2,
  AlertCircle,
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

export interface PaperbookItem {
  id: string;
  label?: string;
  sNo: string | number;
  particulars: React.ReactNode;
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

const SECTION_LABELS: Record<"initial" | "annexures" | "tail", string> = {
  initial: "Initial (before annexures)",
  annexures: "Annexures",
  tail: "Tail (after annexures)",
};

const SECTION_KEYS = ["initial", "annexures", "tail"] as const;

export function PaperbookGeneratorView({
  children,
  open,
  onOpenChange,
  title = "Paperbook Generator",
  description = "Gray items are system-generated (click any to override with your own file), red items need your upload, yellow are optional. The final PDF is merged in the order below.",
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
  maxHeight = "60vh",
}: PaperbookGeneratorViewProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    initial: false,
    annexures: false,
    tail: false,
  });
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false);

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allItems = [
    ...sections.initial,
    ...sections.annexures,
    ...sections.tail,
  ];

  const mandatoryMissing = allItems.filter(
    (it) => it.status === "mandatory_missing"
  );
  const optionalMissing = allItems.filter(
    (it) => it.status === "optional_missing"
  );

  const missingList =
    missingMandatoryLabels && missingMandatoryLabels.length > 0
      ? missingMandatoryLabels
      : mandatoryMissing.map((it) =>
          it.label || (typeof it.particulars === "string" ? it.particulars : `S. No. ${it.sNo}`)
        );

  const isGoDisabled = isGenerating || isProcessingOcr || !canExport;

  const handleGoClick = () => {
    if (missingList.length > 0) {
      setShowIncompleteWarning(true);
    } else {
      onGo();
    }
  };

  const sectionStatus = (items: PaperbookItem[]): "ready" | "mandatory" | "optional" => {
    if (items.some((i) => i.status === "mandatory_missing")) return "mandatory";
    if (items.some((i) => i.status === "optional_missing")) return "optional";
    return "ready";
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
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
        STATUS_META[status].cls
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
      {STATUS_META[status].label}
    </span>
  );

  const renderItemButton = (item: PaperbookItem) => {
    switch (item.status) {
      case "mandatory_missing":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onUpload}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                >
                  <Upload className="h-3 w-3 flex-shrink-0" />
                  Upload
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Please upload a PDF here.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );

      case "optional_missing":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onUpload}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer border border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20"
                >
                  <Upload className="h-3 w-3 flex-shrink-0" />
                  Upload
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Please upload a PDF here (Optional).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );

      case "user_uploaded":
        return (
          <div className="inline-flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={item.onUpload}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                  >
                    <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                    Ready
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[260px] truncate">
                    File uploaded, click to replace: {item.fileName || "uploaded file"}.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {item.onRemove && (
              <button
                type="button"
                onClick={item.onRemove}
                title="Remove file"
                aria-label="Remove file"
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );

      case "auto_ready":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={item.onUpload}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                >
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                  Ready
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Click to replace</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );

      case "auto_frozen":
      default:
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 opacity-90 cursor-not-allowed">
                  <Lock className="h-3 w-3 flex-shrink-0" />
                  Ready
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {item.lockedTooltip || "File frozen, cannot be replaced"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
    }
  };

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
        <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Readiness summary banner */}
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
            overallStatus === "mandatory"
              ? "border-red-500/30 bg-red-500/5"
              : overallStatus === "optional"
              ? "border-yellow-500/30 bg-yellow-500/5"
              : "border-green-500/30 bg-green-500/5"
          )}
        >
          <span className="font-medium">
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
          <StatusChip status={overallStatus} />
        </div>

        {/* The 3 Collapsible Lists */}
        <ScrollArea className="pr-4" style={{ height: maxHeight }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] text-xs">S.No.</TableHead>
                <TableHead className="text-xs">Particulars</TableHead>
                <TableHead className="w-[180px] text-center text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SECTION_KEYS.map((key) => {
                const items = sections[key];
                const isSecCollapsed = !!collapsed[key];
                const secStatus = sectionStatus(items);

                return (
                  <React.Fragment key={key}>
                    {/* Collapsible Section Header */}
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={3} className="py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleSection(key)}
                          className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                !isSecCollapsed && "rotate-90"
                              )}
                            />
                            {SECTION_LABELS[key]}
                            <span className="font-normal normal-case text-muted-foreground/60">
                              ({items.length})
                            </span>
                          </span>
                          <StatusChip status={secStatus} />
                        </button>
                      </TableCell>
                    </TableRow>

                    {/* Section Items */}
                    {!isSecCollapsed &&
                      items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {item.sNo}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{item.particulars}</div>
                            {item.extra && <div className="mt-1">{item.extra}</div>}
                          </TableCell>
                          <TableCell className="text-center">
                            {renderItemButton(item)}
                          </TableCell>
                        </TableRow>
                      ))}

                    {!isSecCollapsed && items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-xs text-muted-foreground py-2 italic"
                        >
                          No components in this section.
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Custom options (e.g. Refiling checkbox or Front matter ordering) and OCR Option */}
        <div className="mt-2 border-t pt-2 space-y-2">
          {customOptions}

          {ocr && (
            <div className="flex items-start space-x-2">
              <Checkbox
                id="paperbook-enable-ocr"
                checked={ocr.checked}
                onCheckedChange={(checked) => ocr.onChange(checked as boolean)}
                disabled={ocr.disabled || isGenerating}
                className="mt-0.5"
              />
              <label
                htmlFor="paperbook-enable-ocr"
                className="text-xs leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                <span className="font-medium">Run OCR on the merged PDF</span>
                <span className="block text-[11px] text-muted-foreground">
                  Makes scanned/image pages text-searchable. Use only if your uploads include scanned documents — it takes longer.
                </span>
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
        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <div>
            {/* Optional left slot or spacer */}
          </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseAttempt}
              >
                Back
              </Button>

              <Button
                type="button"
                onClick={handleGoClick}
                disabled={isGoDisabled}
              >
                {(isGenerating || isProcessingOcr) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isProcessingOcr
                  ? "Processing OCR..."
                  : isGenerating
                  ? progressPercent !== null
                    ? `Generating ${progressPercent}%`
                    : "Generating…"
                  : "Go"}
              </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showIncompleteWarning} onOpenChange={setShowIncompleteWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-600 dark:text-amber-500 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Incomplete Paperbook
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-foreground/90 space-y-2">
            <span>
              WARNING: This will generate an INCOMPLETE paperbook which is NOT ready to be filed. Since the following mandatory documents have not been uploaded, Drafto will use placeholders in their stead:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-48 overflow-y-auto pl-2 my-2">
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            {missingList.map((label, idx) => (
              <li key={idx} className="font-medium text-foreground">{label}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm font-medium">Proceed anyway?</p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowIncompleteWarning(false)}>
            No
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowIncompleteWarning(false);
              onGo();
            }}
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

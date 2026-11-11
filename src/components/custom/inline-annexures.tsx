"use client";

import React, { useRef, useState, useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  Paperclip,
  Trash2,
  Copy,
  Plus,
  Upload,
  Check,
  Pencil,
  ChevronDown,
} from "lucide-react";
import type { DraftoProject, Annexure } from "@/lib/schema";
import { annexureSchema, collyDocumentSchema } from "@/lib/schema";
import { pickFile } from "@/lib/utils/pick-file";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { isScWpFamily } from "@/lib/court-family";
import { factsAnnexureSentenceParts } from "@/lib/wp/wp-facts";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";

// Auto-growing textarea for Title & Custom text
const AutoGrowField = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <Textarea
    {...props}
    ref={(el) => {
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as any).current = el;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }}
    rows={1}
    onInput={(e) => {
      const t = e.currentTarget;
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight}px`;
    }}
    className={cn("min-h-0 resize-none overflow-hidden py-1 leading-snug", className)}
  />
));
AutoGrowField.displayName = "AutoGrowField";

function CollyConstituentsInline({
  lodIndex,
  annexIndex,
  rowsName = "listOfDates",
}: {
  lodIndex: number;
  annexIndex: number;
  rowsName?: string;
}) {
  const form = useFormContext<DraftoProject>();
  const base = `${rowsName}.${lodIndex}.annexures.${annexIndex}.collyDocuments`;
  const list: any[] = form.watch(base as any) || [];

  const handleAppendConstituent = () => {
    const cur = form.getValues(base as any) || [];
    form.setValue(base as any, [...cur, collyDocumentSchema.parse({})], { shouldDirty: true });
  };

  const handleRemoveConstituent = (idx: number) => {
    const cur = form.getValues(base as any) || [];
    form.setValue(base as any, cur.filter((_: any, i: number) => i !== idx), { shouldDirty: true });
  };

  const pick = async (i: number) => {
    const file = await pickFile();
    if (file) {
      form.setValue(`${base}.${i}.file` as any, file, { shouldDirty: true });
      form.setValue(`${base}.${i}.filePath` as any, (file as any).path);
    }
  };

  return (
    <div className="mt-1 ml-3 pl-2 border-l border-primary/20 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase font-semibold tracking-wider text-muted-foreground">
          Colly Constituents (bookmarked individually)
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-4 px-1 text-[9px] text-primary"
          onClick={handleAppendConstituent}
        >
          <Plus className="mr-0.5 h-2.5 w-2.5" /> Add
        </Button>
      </div>
      {list.map((cd, i) => {
        const has = cd?.file instanceof File || !!cd?.filePath;
        return (
          <div key={cd.id || i} className="flex items-center gap-1">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    className={cn(
                      "rounded p-0.5 text-muted-foreground hover:bg-muted transition-colors",
                      has && "text-primary font-bold"
                    )}
                  >
                    <Upload className="h-2.5 w-2.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{has ? (cd?.file?.name || cd?.filePath) : "Attach constituent PDF"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Input
              {...form.register(`${base}.${i}.title` as any)}
              placeholder="Constituent title / description"
              className="h-5 text-[11px] flex-1 bg-background px-1.5"
            />
            <Input
              {...form.register(`${base}.${i}.date` as any)}
              placeholder="Date"
              className="h-5 w-20 text-[11px] bg-background px-1.5"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive"
              onClick={() => handleRemoveConstituent(i)}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

interface InlineAnnexureCardProps {
  lodIndex: number;
  annexIndex: number;
  annex: Annexure;
  pNumber?: number;
  annexPrefix: string;
  rowsName: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function InlineAnnexureCard({
  lodIndex,
  annexIndex,
  annex,
  pNumber,
  annexPrefix,
  rowsName,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: InlineAnnexureCardProps) {
  const form = useFormContext<DraftoProject>();
  const courtType = useWatch({ control: form.control, name: "courtType" }) as string | undefined;
  const isWp = courtType === "WritPetitionDHC";
  const isOa = courtType === "OriginalApplicationCAT";
  const isScWp = isScWpFamily(courtType);

  const showIoCheckbox = isWp || isOa || isScWp;
  const showAdCheckbox = !isWp && !isOa && !isScWp;
  const showCollyCheckbox = isWp;

  // Blank annexures start in editable state; filled ones collapse to compact view
  const [isEditing, setIsEditing] = useState<boolean>(() => !annex.title || !annex.title.trim());

  const [showCustomText, setShowCustomText] = useState(
    () => Boolean(annex.customText && annex.customText.trim())
  );
  const [showCollySection, setShowCollySection] = useState(
    () => Boolean(annex.isColly)
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typedFileInputRef = useRef<HTMLInputElement | null>(null);

  const basePath = `${rowsName}.${lodIndex}.annexures.${annexIndex}`;

  // If Find & Replace targets a field inside this annexure, auto-open into edit mode
  useEffect(() => {
    const applyPending = () => {
      const p = getPendingReveal();
      if (p?.path && p.path.startsWith(basePath)) {
        setIsEditing(true);
      }
    };
    window.addEventListener(FIND_REVEAL_EVENT, applyPending);
    applyPending();
    return () => window.removeEventListener(FIND_REVEAL_EVENT, applyPending);
  }, [basePath]);

  const fileVal = form.watch(`${basePath}.file` as any);
  const filePathVal = form.watch(`${basePath}.filePath` as any);
  const typedFileVal = form.watch(`${basePath}.typedOrTranslatedFile` as any);
  const typedFilePathVal = form.watch(`${basePath}.typedOrTranslatedFilePath` as any);
  const copyTypeVal = form.watch(`${basePath}.copyType` as any);
  const showTypedUpload =
    copyTypeVal === "true and typed copy" || copyTypeVal === "true and translated copy";

  const hasMainFile = fileVal instanceof File || !!filePathVal;
  const mainFileName = fileVal instanceof File ? fileVal.name : (filePathVal ? String(filePathVal).split(/[\\/]/).pop() : "");

  const hasTypedFile = typedFileVal instanceof File || !!typedFilePathVal;
  const typedFileName = typedFileVal instanceof File ? typedFileVal.name : (typedFilePathVal ? String(typedFilePathVal).split(/[\\/]/).pop() : "");

  const handlePickMain = async () => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile();
      if (file) {
        form.setValue(`${basePath}.file` as any, file, { shouldDirty: true, shouldTouch: true });
        form.setValue(`${basePath}.filePath` as any, (file as any).path, { shouldDirty: true });
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handlePickTyped = async () => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile();
      if (file) {
        form.setValue(`${basePath}.typedOrTranslatedFile` as any, file, { shouldDirty: true, shouldTouch: true });
        form.setValue(`${basePath}.typedOrTranslatedFilePath` as any, (file as any).path, { shouldDirty: true });
      }
    } else {
      typedFileInputRef.current?.click();
    }
  };

  // Render the formatted sentence parts for the collapsed preview card
  const sentenceParts = pNumber !== undefined
    ? factsAnnexureSentenceParts(pNumber, annex, annexPrefix)
    : { label: `Annexure ${annexPrefix}-?`, rest: ` is a ${annex.copyType || "true copy"} of ${annex.title || "[description]"}` };

  // ── 1. ULTRA-COMPACT COLLAPSED CARD ─────────────────────────────────────────
  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="group/annex-preview relative flex items-start justify-between px-1 py-0.5 rounded bg-muted/30 hover:bg-muted/60 border border-border/40 hover:border-border/70 transition-colors text-[11px] leading-snug select-text cursor-pointer"
        title="Click to edit this annexure"
      >
        <div className="flex-1 min-w-0 text-[11px] leading-snug">
          <span className="font-semibold text-primary">
            {sentenceParts.label}
          </span>
          <span className="text-neutral-600 dark:text-neutral-400 font-normal">
            {sentenceParts.rest}
          </span>

          {/* Micro PDF Attachment Indicator */}
          {hasMainFile && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-green-700 dark:text-green-300 font-medium bg-green-500/10 px-1 py-0 rounded border border-green-500/20 max-w-[100px] truncate ml-1.5 align-middle">
                    <Paperclip className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{mainFileName}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Attached PDF: {mainFileName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Micro AD / IO Badges */}
          {annex.isAdditionalDocument && (
            <span className="inline-flex items-center text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1 py-0 rounded border border-amber-500/20 ml-1.5 align-middle">
              AD
            </span>
          )}
          {annex.isImpugnedOrder && (
            <span className="inline-flex items-center text-[9px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-500/10 px-1 py-0 rounded border border-blue-500/20 ml-1.5 align-middle">
              IO
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── 2. ULTRA-COMPACT EDITABLE CARD ──────────────────────────────────────────
  return (
    <div className="group/annex relative rounded border border-primary/40 bg-card px-1.5 py-1 shadow-xs transition-all focus-within:border-primary/60">
      <input
        type="file"
        accept=".pdf"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            form.setValue(`${basePath}.file` as any, file, { shouldDirty: true, shouldTouch: true });
            if ((file as any).path) {
              form.setValue(`${basePath}.filePath` as any, (file as any).path, { shouldDirty: true });
            }
          }
        }}
      />
      <input
        type="file"
        accept=".pdf"
        ref={typedFileInputRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            form.setValue(`${basePath}.typedOrTranslatedFile` as any, file, { shouldDirty: true, shouldTouch: true });
            if ((file as any).path) {
              form.setValue(`${basePath}.typedOrTranslatedFilePath` as any, (file as any).path, { shouldDirty: true });
            }
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {/* Reorder Buttons */}
        {(!isFirst || !isLast) && (
          <div className="flex flex-col -space-y-1 mr-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={onMoveUp}
              title="Move up"
              className={cn(
                "p-0.5 text-[8px] text-muted-foreground hover:text-foreground disabled:opacity-20",
                isFirst && "pointer-events-none"
              )}
            >
              ▲
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={onMoveDown}
              title="Move down"
              className={cn(
                "p-0.5 text-[8px] text-muted-foreground hover:text-foreground disabled:opacity-20",
                isLast && "pointer-events-none"
              )}
            >
              ▼
            </button>
          </div>
        )}

        {/* Annexure Number Badge */}
        <span className="inline-flex items-center font-semibold text-primary px-1 py-0 rounded bg-primary/10 text-[10px] whitespace-nowrap">
          {annexPrefix}-{pNumber !== undefined ? pNumber : "—"}
        </span>

        <span className="text-muted-foreground text-[11px]">is a</span>

        {/* Copy Type Select */}
        <Select
          value={copyTypeVal || "true copy"}
          onValueChange={(val) => form.setValue(`${basePath}.copyType` as any, val, { shouldDirty: true })}
        >
          <SelectTrigger className="h-5 w-auto min-w-[110px] text-[11px] px-1.5 bg-background border-input/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true copy" className="text-xs">true copy</SelectItem>
            <SelectItem value="typed copy" className="text-xs">typed copy</SelectItem>
            <SelectItem value="true and typed copy" className="text-xs">true and typed copy</SelectItem>
            <SelectItem value="translated copy" className="text-xs">translated copy</SelectItem>
            <SelectItem value="true and translated copy" className="text-xs">true and translated copy</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-muted-foreground text-[11px]">of</span>

        {/* Title / Description Field */}
        <div className="flex-1 min-w-[150px]">
          <AutoGrowField
            {...form.register(`${basePath}.title` as any)}
            placeholder="Description of document"
            className="text-[11px] h-5 py-0 px-1.5 bg-background border-input/80 font-normal"
          />
        </div>

        <span className="text-muted-foreground text-[11px]">dated</span>

        {/* Document Date */}
        <Input
          {...form.register(`${basePath}.date` as any)}
          placeholder="Date"
          className="h-5 w-20 text-[11px] px-1.5 bg-background border-input/80"
        />

        {/* PDF Attachment Icon & Tooltip */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePickMain}
                className={cn(
                  "p-0.5 rounded border transition-colors flex items-center gap-0.5 text-[10px]",
                  hasMainFile
                    ? "bg-green-500/10 border-green-500/40 text-green-700 dark:text-green-300 hover:bg-green-500/20"
                    : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Paperclip className="h-3 w-3" />
                {hasMainFile && (
                  <span className="text-[9px] max-w-[70px] truncate hidden sm:inline">
                    {mainFileName}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{hasMainFile ? `Attached: ${mainFileName}` : "Attach PDF file"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Typed / Translated PDF Attachment */}
        {showTypedUpload && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handlePickTyped}
                  className={cn(
                    "p-0.5 rounded border transition-colors flex items-center gap-0.5 text-[9px]",
                    hasTypedFile
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20"
                      : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Upload className="h-3 w-3" />
                  <span>Typed</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{hasTypedFile ? `Attached typed/translated: ${typedFileName}` : "Attach typed/translated PDF"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* AD Checkbox */}
        {showAdCheckbox && (
          <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-pointer select-none px-0.5 py-0 rounded hover:bg-muted/40">
            <Checkbox
              checked={form.watch(`${basePath}.isAdditionalDocument` as any)}
              onCheckedChange={(checked) =>
                form.setValue(`${basePath}.isAdditionalDocument` as any, !!checked, { shouldDirty: true })
              }
              className="h-3 w-3"
            />
            <span title="To be checked if this annexure was not before the court below">AD</span>
          </label>
        )}

        {/* IO Checkbox */}
        {showIoCheckbox && (
          <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-pointer select-none px-0.5 py-0 rounded hover:bg-muted/40">
            <Checkbox
              checked={form.watch(`${basePath}.isImpugnedOrder` as any)}
              onCheckedChange={(checked) =>
                form.setValue(`${basePath}.isImpugnedOrder` as any, !!checked, { shouldDirty: true })
              }
              className="h-3 w-3"
            />
            <span title="Mark as an Impugned Order (sorts to front)">IO</span>
          </label>
        )}

        {/* Colly Checkbox */}
        {showCollyCheckbox && (
          <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-pointer select-none px-0.5 py-0 rounded hover:bg-muted/40">
            <Checkbox
              checked={form.watch(`${basePath}.isColly` as any)}
              onCheckedChange={(checked) => {
                form.setValue(`${basePath}.isColly` as any, !!checked, { shouldDirty: true });
                setShowCollySection(!!checked);
              }}
              className="h-3 w-3"
            />
            <span title="Clubs multiple documents collectively under one annexure number">Colly</span>
          </label>
        )}

        {/* Toggle Custom Rider Button */}
        <button
          type="button"
          onClick={() => setShowCustomText((prev) => !prev)}
          className={cn(
            "text-[9px] px-1 py-0 rounded border border-dashed transition-colors",
            showCustomText || (annex.customText && annex.customText.trim())
              ? "bg-accent/30 text-accent-foreground border-accent font-medium"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          )}
          title="Add custom trailing text or rider to the annexure sentence"
        >
          {showCustomText ? "rider ▲" : "+ rider"}
        </button>

        {/* Green Tick Button to Collapse */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsEditing(false)}
          className="h-5 w-5 p-0 rounded-full bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/40 hover:border-green-500 transition-colors ml-auto"
          title="Done editing — collapse to sentence view"
        >
          <Check className="h-3 w-3 stroke-[2.5]" />
        </Button>

        {/* Delete Annexure Action */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete annexure"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Annexure {annexPrefix}-{pNumber !== undefined ? pNumber : ""}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove this annexure from the date entry. You can undo this action if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Expandable Custom Rider Textarea */}
      {showCustomText && (
        <div className="mt-1 pt-0.5 border-t border-dashed border-border/50">
          <AutoGrowField
            {...form.register(`${basePath}.customText` as any)}
            placeholder="Custom text (e.g., '(marked as Exhibit P-3 before the Trial Court)')"
            className="text-[11px] h-5 py-0 px-1.5 bg-background border-input/60 text-muted-foreground italic"
          />
        </div>
      )}

      {/* Colly Sub-Documents */}
      {showCollyCheckbox && showCollySection && (
        <CollyConstituentsInline lodIndex={lodIndex} annexIndex={annexIndex} rowsName={rowsName} />
      )}
    </div>
  );
}

// ── STANDALONE ADD ANNEXURE BUTTON UNDER DATE CELL ────────────────────────────
export interface AddAnnexureButtonProps {
  lodIndex: number;
  rowsName?: string;
  annexureNumberingMap: Map<string, number>;
  annexPrefix: string;
}

export function AddAnnexureButton({
  lodIndex,
  rowsName = "listOfDates",
  annexureNumberingMap,
  annexPrefix,
}: AddAnnexureButtonProps) {
  const form = useFormContext<DraftoProject>();
  const rowAnnexures: any[] = form.watch(`${rowsName}.${lodIndex}.annexures` as any) || [];
  const hasAnnexures = rowAnnexures.length > 0;

  // Clone options from across the entire project
  const cloneOptions = (() => {
    const allLods = form.getValues(rowsName as "listOfDates") ?? [];
    return allLods
      .flatMap((lod: any) => lod.annexures ?? [])
      .filter((a: any) => a?.id && annexureNumberingMap.has(a.id))
      .map((a: any) => ({
        id: a.id,
        pNumber: annexureNumberingMap.get(a.id)!,
        title: a.title,
      }))
      .sort((a: any, b: any) => a.pNumber - b.pNumber);
  })();

  const handleClone = (sourceId: string) => {
    const allLods = form.getValues(rowsName as "listOfDates") ?? [];
    const source = allLods.flatMap((lod: any) => lod.annexures ?? []).find((a: any) => a.id === sourceId);
    if (!source) return;
    const cur = form.getValues(`${rowsName}.${lodIndex}.annexures` as any) || [];
    const cloned = {
      id: `annex_${Math.random()}`,
      isAdditionalDocument: source.isAdditionalDocument,
      copyType: source.copyType,
      title: source.title,
      date: source.date,
      customText: source.customText,
      isImpugnedOrder: source.isImpugnedOrder,
      isColly: source.isColly,
      collyDocuments: source.collyDocuments || [],
    };
    form.setValue(`${rowsName}.${lodIndex}.annexures` as any, [...cur, cloned], {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleAddBlank = () => {
    const cur = form.getValues(`${rowsName}.${lodIndex}.annexures` as any) || [];
    const blank = annexureSchema.parse({});
    form.setValue(`${rowsName}.${lodIndex}.annexures` as any, [...cur, blank], {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  return (
    <div className={cn(
      "flex items-center justify-center pt-0.5",
      !hasAnnexures ? "opacity-40 hover:opacity-100 transition-opacity" : "opacity-80 hover:opacity-100"
    )}>
      {cloneOptions.length === 0 ? (
        <button
          type="button"
          onClick={handleAddBlank}
          className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary transition-colors py-0.5 px-1 rounded hover:bg-muted/40 font-medium whitespace-nowrap"
          title="Add Annexure"
        >
          <Plus className="h-2.5 w-2.5" />
          <span>+ Annex</span>
        </button>
      ) : (
        <div className="inline-flex items-center rounded border border-border/40 bg-background/60 hover:bg-background text-[9px] text-muted-foreground transition-colors overflow-hidden h-4.5">
          <button
            type="button"
            onClick={handleAddBlank}
            className="inline-flex items-center gap-0.5 px-1 h-full hover:text-primary hover:bg-muted/40 transition-colors whitespace-nowrap"
            title="Add a new blank annexure"
          >
            <Plus className="h-2 w-2" />
            <span>+ Annex</span>
          </button>

          <span className="w-px h-2.5 bg-border/50" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="px-0.5 h-full hover:text-primary hover:bg-muted/40 transition-colors flex items-center"
                title="Clone an annexure from this project"
              >
                <ChevronDown className="h-2 w-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-56 overflow-y-auto max-w-xs">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground tracking-wider border-b">
                Clone from project
              </div>
              {cloneOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  onClick={() => handleClone(opt.id)}
                  className="text-xs"
                >
                  <span className="font-semibold mr-1.5 text-primary">
                    {annexPrefix}-{opt.pNumber}
                  </span>
                  <span className="truncate">{opt.title || "(Untitled)"}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ── INLINE ANNEXURES STRIP (Rendered below Particulars) ────────────────────────
export interface InlineAnnexuresStripProps {
  lodIndex: number;
  rowsName?: string;
  annexureNumberingMap: Map<string, number>;
  annexPrefix: string;
}

export function InlineAnnexuresStrip({
  lodIndex,
  rowsName = "listOfDates",
  annexureNumberingMap,
  annexPrefix,
}: InlineAnnexuresStripProps) {
  const form = useFormContext<DraftoProject>();
  const rowAnnexures: any[] = form.watch(`${rowsName}.${lodIndex}.annexures` as any) || [];

  if (!Array.isArray(rowAnnexures) || rowAnnexures.length === 0) return null;

  const handleMove = (from: number, to: number) => {
    const cur = [...(form.getValues(`${rowsName}.${lodIndex}.annexures` as any) || [])];
    if (from < 0 || to < 0 || from >= cur.length || to >= cur.length) return;
    const item = cur.splice(from, 1)[0];
    cur.splice(to, 0, item);
    form.setValue(`${rowsName}.${lodIndex}.annexures` as any, cur, { shouldDirty: true, shouldTouch: true });
  };

  const handleRemove = (idx: number) => {
    const cur = [...(form.getValues(`${rowsName}.${lodIndex}.annexures` as any) || [])];
    cur.splice(idx, 1);
    form.setValue(`${rowsName}.${lodIndex}.annexures` as any, cur, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <div className="mt-1 space-y-1 pt-0.5 border-t border-border/30 select-text">
      {rowAnnexures.map((annex: any, annexIdx: number) => {
        const pNumber = annex.id ? annexureNumberingMap.get(annex.id) : undefined;
        return (
          <InlineAnnexureCard
            key={annex.id || annexIdx}
            lodIndex={lodIndex}
            annexIndex={annexIdx}
            annex={annex}
            pNumber={pNumber}
            annexPrefix={annexPrefix}
            rowsName={rowsName}
            isFirst={annexIdx === 0}
            isLast={annexIdx === rowAnnexures.length - 1}
            onMoveUp={() => handleMove(annexIdx, annexIdx - 1)}
            onMoveDown={() => handleMove(annexIdx, annexIdx + 1)}
            onRemove={() => handleRemove(annexIdx)}
          />
        );
      })}
    </div>
  );
}

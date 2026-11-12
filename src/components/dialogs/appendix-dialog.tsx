"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject } from "@/lib/schema"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { FormControl, FormField, FormItem, FormLabel } from "../ui/form"
import { Input } from "../ui/input"
import { BadhiyaBox } from "@/components/custom/badhiya-box"
import { Checkbox } from "../ui/checkbox"
import { Paperclip, Plus, Trash2, Pencil, RotateCcw, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { pickFile } from "@/lib/utils/pick-file"
import {
  APPENDIX_DESCRIPTION_LABELS,
  APPENDIX_DESCRIPTION_PLACEHOLDERS,
  APPENDIX_KIND_LABELS,
  appendixBodyText,
  appendixHasContent,
  appendixLabel,
  appendixLetter,
  getAppendixItems,
  makeAppendixItem,
  type AppendixItem,
  type AppendixKind,
} from "@/lib/appendix"

const KIND_ORDER: AppendixKind[] = ["provisions", "judgment", "custom"]

// One Appendix document.
function AppendixRow({
  index,
  onRemove,
  letter,
  isIncluded,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  index: number
  onRemove: () => void
  letter: string
  isIncluded: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const form = useFormContext<DraftoProject>()
  const item = useWatch({ control: form.control, name: `appendixItems.${index}` }) as AppendixItem | undefined
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [editingIndexText, setEditingIndexText] = useState(false)

  if (!item) return null

  const kind = (item.kind || "provisions") as AppendixKind
  const uploadOnly = kind === "judgment"
  const useManual = !uploadOnly && !!item.useManual
  const hasFile = item.file instanceof File
  const fileName = hasFile ? (item.file as File).name : (item.filePath ? String(item.filePath).split(/[\\/]/).pop() : "")
  const hasOverride = !!(item.indexTextOverride || "").trim()

  const handleFileClick = async () => {
    if (window.electron?.openFileDialog) {
      const file = await pickFile()
      if (file) {
        form.setValue(`appendixItems.${index}.file`, file, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
        form.setValue(`appendixItems.${index}.filePath`, (file as any).path)
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const startEditingIndexText = () => {
    if (!hasOverride) {
      form.setValue(`appendixItems.${index}.indexTextOverride`, appendixBodyText(item), { shouldDirty: true })
    }
    setEditingIndexText(true)
  }
  const resetIndexText = () => {
    form.setValue(`appendixItems.${index}.indexTextOverride`, "", { shouldDirty: true })
    setEditingIndexText(false)
  }

  return (
    <div className="rounded-lg border border-border/70 bg-card p-2.5 space-y-2 shadow-xs w-full">
      {/* Top Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Reorder Buttons (Up / Down) */}
          {(!isFirst || !isLast) && (
            <div className="flex flex-col -space-y-1 shrink-0 mr-0.5">
              <button
                type="button"
                disabled={isFirst}
                onClick={onMoveUp}
                title="Move up"
                className={cn(
                  "h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer",
                  isFirst && "pointer-events-none"
                )}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={onMoveDown}
                title="Move down"
                className={cn(
                  "h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer",
                  isLast && "pointer-events-none"
                )}
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}

          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
            {letter}
          </span>

          {/* Segmented control for Kind */}
          <div className="inline-flex items-center rounded-md border border-input/60 bg-muted/40 p-0.5 text-[10px] leading-none select-none">
            <button
              type="button"
              onClick={() => {
                form.setValue(`appendixItems.${index}.kind`, "provisions", { shouldDirty: true })
              }}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                kind === "provisions"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Provisions
            </button>
            <button
              type="button"
              onClick={() => {
                form.setValue(`appendixItems.${index}.kind`, "judgment", { shouldDirty: true })
                form.setValue(`appendixItems.${index}.useManual`, false, { shouldDirty: true })
              }}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                kind === "judgment"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Judgment
            </button>
            <button
              type="button"
              onClick={() => {
                form.setValue(`appendixItems.${index}.kind`, "custom", { shouldDirty: true })
              }}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                kind === "custom"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Custom
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Segmented control for Source (PDF vs Type) */}
          {!uploadOnly && (
            <div className="inline-flex items-center rounded-md border border-input/60 bg-muted/40 p-0.5 text-[10px] leading-none select-none">
              <button
                type="button"
                onClick={() => form.setValue(`appendixItems.${index}.useManual`, false, { shouldDirty: true })}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                  !useManual
                    ? "bg-background text-primary shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => form.setValue(`appendixItems.${index}.useManual`, true, { shouldDirty: true })}
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-all cursor-pointer",
                  useManual
                    ? "bg-background text-primary shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Type it out
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive h-6 w-6 inline-flex items-center justify-center rounded cursor-pointer"
            title="Remove this Appendix"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {useManual ? (
        <div className="space-y-1.5">
          <FormField
            control={form.control}
            name={`appendixItems.${index}.description`}
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <Input
                    {...field}
                    className="text-xs h-7 w-full"
                    placeholder={APPENDIX_DESCRIPTION_PLACEHOLDERS[kind]}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`appendixItems.${index}.manualEntry`}
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[140px]">
            <FormField
              control={form.control}
              name={`appendixItems.${index}.description`}
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <Input
                      {...field}
                      className="text-xs h-7"
                      placeholder={APPENDIX_DESCRIPTION_PLACEHOLDERS[kind]}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleFileClick}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors cursor-pointer max-w-[200px]",
                hasFile
                  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                  : "border-input bg-background hover:bg-accent text-foreground"
              )}
              title={hasFile ? fileName : "Choose PDF"}
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{hasFile ? fileName : "Choose PDF"}</span>
            </button>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  form.setValue(`appendixItems.${index}.file`, file, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
                  if ((file as any).path) {
                    form.setValue(`appendixItems.${index}.filePath`, (file as any).path)
                  }
                }
              }}
              ref={fileInputRef}
              className="hidden"
            />

            {hasFile && (
              <button
                type="button"
                onClick={() => {
                  form.setValue(`appendixItems.${index}.file`, undefined, { shouldDirty: true })
                  form.setValue(`appendixItems.${index}.filePath`, undefined, { shouldDirty: true })
                }}
                className="text-muted-foreground hover:text-destructive h-6 w-6 inline-flex items-center justify-center rounded cursor-pointer"
                title="Detach PDF"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Subtle Index Entry line */}
      <div className="pt-1 border-t border-border/40 text-[11px] leading-tight flex flex-wrap items-center justify-between gap-1.5">
        {editingIndexText ? (
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[140px]">
            <span className="text-muted-foreground whitespace-nowrap">Index:</span>
            <FormField
              control={form.control}
              name={`appendixItems.${index}.indexTextOverride`}
              render={({ field }) => (
                <Input {...field} className="text-xs h-6 py-0 px-1.5 flex-1 min-w-[120px]" autoFocus />
              )}
            />
            <button
              type="button"
              onClick={resetIndexText}
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
              title="Reset to standard index wording"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between w-full gap-1.5">
            <div className="text-[11px] text-muted-foreground leading-normal break-words flex-1 min-w-0 select-text">
              <span className="font-semibold text-foreground">Index: </span>
              <span className="font-medium text-primary/90">{letter}: </span>
              <span>{appendixBodyText(item)}</span>
            </div>
            <button
              type="button"
              onClick={startEditingIndexText}
              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded cursor-pointer mt-0.5"
              title="Edit Index entry wording"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function AppendixContent() {
  const form = useFormContext<DraftoProject>()
  const items = (useWatch({ control: form.control, name: "appendixItems" }) || []) as AppendixItem[]

  const { append, remove, move } = useFieldArray({ control: form.control, name: "appendixItems", keyName: "_rhfKey" as any })

  const handleMove = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return
    const cur = [...(form.getValues("appendixItems") as AppendixItem[] || [])]
    if (from >= cur.length || to >= cur.length) return
    const [moved] = cur.splice(from, 1)
    cur.splice(to, 0, moved)
    move(from, to)
    form.setValue("appendixItems", cur as any, { shouldDirty: true, shouldTouch: true })
  }

  // Auto-migrate legacy projects if needed
  useEffect(() => {
    const current = form.getValues("appendixItems") as AppendixItem[] | undefined
    if (current && current.length > 0) return
    const migrated = getAppendixItems(form.getValues())
    if (migrated.length > 0) {
      form.setValue("appendixItems", migrated as any, { shouldDirty: false })
    }
  }, [form])

  // Sync wantsAppendix flag with whether any appendix items exist
  useEffect(() => {
    const hasItems = items.length > 0
    if (form.getValues("wantsAppendix") !== hasItems) {
      form.setValue("wantsAppendix", hasItems, { shouldDirty: true })
    }
  }, [form, items.length])

  const letters = useMemo(() => {
    return items.map((_, index) => {
      return items.length > 1 ? `Appendix-${appendixLetter(index)}` : "Appendix"
    })
  }, [items.length])

  const addDocument = () => {
    append(makeAppendixItem() as any, { shouldFocus: false })
    form.setValue("wantsAppendix", true, { shouldDirty: true })
  }

  return (
    <div className="space-y-2 py-1 px-0.5">
      {/* Sleek Top Bar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5 border-b">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground">Appendix Documents</span>
          <span className="text-[10px] text-muted-foreground">Statutory provisions, judgments, or other reference materials</span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 px-2.5 cursor-pointer font-medium"
          onClick={addDocument}
        >
          <Plus className="h-3 w-3" />
          <span>Add Document</span>
        </Button>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="py-6 px-4 text-center rounded-lg border border-dashed border-border/70 bg-muted/10 space-y-1">
            <p className="text-xs font-medium text-foreground/80">No Appendix documents added</p>
            <p className="text-[11px] text-muted-foreground">
              Click &ldquo;+ Add Document&rdquo; above if your paperbook requires statutory provisions, judgments, or other appendix materials.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <AppendixRow
                key={item.id || index}
                index={index}
                letter={letters[index]}
                isIncluded={appendixHasContent(item)}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onMoveUp={() => handleMove(index, index - 1)}
                onMoveDown={() => handleMove(index, index + 1)}
                onRemove={() => {
                  remove(index)
                  if (items.length <= 1) {
                    form.setValue("wantsAppendix", false, { shouldDirty: true })
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AppendixDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Appendix</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Appendix</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <AppendixContent />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" size="sm">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

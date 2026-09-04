
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
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { Input } from "../ui/input"
import { BadhiyaBox } from "@/components/custom/badhiya-box"
import { Checkbox } from "../ui/checkbox"
import { Paperclip, Plus, Trash2, Pencil, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { pickFile } from "@/lib/utils/pick-file"
import {
  APPENDIX_DESCRIPTION_LABELS,
  APPENDIX_DESCRIPTION_PLACEHOLDERS,
  APPENDIX_KIND_LABELS,
  appendixBodyText,
  appendixHasContent,
  appendixLabel,
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
}: {
  index: number
  onRemove: () => void
  letter: string
  isIncluded: boolean
}) {
  const form = useFormContext<DraftoProject>()
  const item = useWatch({ control: form.control, name: `appendixItems.${index}` }) as AppendixItem | undefined
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [editingIndexText, setEditingIndexText] = useState(false)

  if (!item) return null

  const kind = (item.kind || "provisions") as AppendixKind
  // A judgment goes on record as a copy of the court's own document, so it can
  // only be uploaded — never typed out.
  const uploadOnly = kind === "judgment"
  const useManual = !uploadOnly && !!item.useManual
  const hasFile = item.file instanceof File
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

  // Clicking Edit hands the user the wording that is currently derived, from
  // that point on it is theirs; Reset drops the override and the row goes back
  // to following the description.
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
    <div className="rounded-md border border-input bg-background/50 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-semibold">{letter}</span>
          {!isIncluded && (
            <span className="text-[10px] text-muted-foreground truncate">
              nothing attached — this one won’t go into the paper-book
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Remove this Appendix"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <FormField
        control={form.control}
        name={`appendixItems.${index}.kind`}
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">This Appendix is</FormLabel>
            <FormControl>
              <RadioGroup
                onValueChange={(value) => {
                  field.onChange(value)
                  // Switching to a judgment drops the typed-out option with it.
                  if (value === "judgment") {
                    form.setValue(`appendixItems.${index}.useManual`, false, { shouldDirty: true })
                  }
                }}
                value={field.value}
                className="flex flex-wrap gap-x-4 gap-y-1"
              >
                {KIND_ORDER.map(k => (
                  <FormItem key={k} className="flex items-center space-x-1 space-y-0">
                    <FormControl><RadioGroupItem value={k} /></FormControl>
                    <FormLabel className="font-normal text-xs cursor-pointer">{APPENDIX_KIND_LABELS[k]}</FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`appendixItems.${index}.description`}
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormLabel className="text-xs">{APPENDIX_DESCRIPTION_LABELS[kind]}</FormLabel>
            <FormControl>
              <Input {...field} className="text-xs" placeholder={APPENDIX_DESCRIPTION_PLACEHOLDERS[kind]} />
            </FormControl>
          </FormItem>
        )}
      />

      {uploadOnly ? (
        <p className="text-xs text-muted-foreground">Upload the PDF of the judgment:</p>
      ) : (
        <FormField
          control={form.control}
          name={`appendixItems.${index}.useManual`}
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs">How is it being provided?</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => field.onChange(value === "true")}
                  value={String(!!field.value)}
                  className="flex space-x-4"
                >
                  <FormItem className="flex items-center space-x-1 space-y-0">
                    <FormControl><RadioGroupItem value="false" /></FormControl>
                    <FormLabel className="font-normal text-xs cursor-pointer">Upload PDF</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-1 space-y-0">
                    <FormControl><RadioGroupItem value="true" /></FormControl>
                    <FormLabel className="font-normal text-xs cursor-pointer">Type it out</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {useManual ? (
        <FormField
          control={form.control}
          name={`appendixItems.${index}.manualEntry`}
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormControl>
                {/* The same rich-text box as the rest of the petition, so a
                    typed-out Appendix keeps its emphasis, lists, quotes and
                    tables all the way into the .docx. */}
                <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
              </FormControl>
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={form.control}
          name={`appendixItems.${index}.file`}
          render={({ field: { onChange, value, ...rest } }) => (
            <FormItem className="space-y-1">
              <FormControl>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFileClick}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-xs max-w-full",
                      hasFile && "border-accent text-accent"
                    )}
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{hasFile ? (item.file as File).name : "Choose PDF"}</span>
                  </button>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        onChange(file)
                        if ((file as any).path) {
                          form.setValue(`appendixItems.${index}.filePath`, (file as any).path)
                        }
                      }
                    }}
                    {...rest}
                    ref={fileInputRef}
                    className="hidden"
                  />
                </div>
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {/* What the Index will say for this document. Live, not a stored copy —
          until the user takes it over with Edit. */}
      <div className="pt-1 border-t border-dashed">
        {editingIndexText ? (
          <FormField
            control={form.control}
            name={`appendixItems.${index}.indexTextOverride`}
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-[11px] text-muted-foreground">Index entry — {letter}:</FormLabel>
                <div className="flex items-center gap-1">
                  <FormControl>
                    <Input {...field} className="text-xs h-7" autoFocus />
                  </FormControl>
                  <button type="button" onClick={resetIndexText} className="text-muted-foreground hover:text-foreground shrink-0" title="Go back to the standard wording">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </FormItem>
            )}
          />
        ) : (
          <div className="flex items-start gap-1">
            <p className="text-[11px] leading-snug text-muted-foreground flex-grow">
              <span className="font-medium text-foreground">Index entry — </span>
              <span className="font-semibold text-foreground">{letter}</span>
              {`: ${appendixBodyText(item)}`}
            </p>
            <button type="button" onClick={startEditingIndexText} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5" title="Edit the wording of this Index entry">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function AppendixContent() {
  const form = useFormContext<DraftoProject>()
  const wantsAppendix = useWatch({ control: form.control, name: "wantsAppendix" })
  const items = (useWatch({ control: form.control, name: "appendixItems" }) || []) as AppendixItem[]

  const { append, remove } = useFieldArray({ control: form.control, name: "appendixItems", keyName: "_rhfKey" as any })

  // Projects saved before the Appendix took several documents carry the old
  // single-Appendix fields; fold them into the first row so nothing is lost.
  // Nothing is written unless there is something to migrate.
  useEffect(() => {
    const current = form.getValues("appendixItems") as AppendixItem[] | undefined
    if (current && current.length > 0) return
    const migrated = getAppendixItems(form.getValues())
    if (migrated.length > 0) {
      form.setValue("appendixItems", migrated as any, { shouldDirty: false })
      return
    }
    // Ticking "Include" should land the user straight in an empty first row.
    if (wantsAppendix) {
      form.setValue("appendixItems", [makeAppendixItem()] as any, { shouldDirty: false })
    }
  }, [form, wantsAppendix])

  // Letters follow the documents that will actually be filed, so what the row
  // shows is what the Index will print.
  const includedCount = useMemo(() => items.filter(appendixHasContent).length, [items])
  const letters = useMemo(() => {
    let seen = 0
    return items.map(item => {
      if (!appendixHasContent(item)) return "Appendix"
      const label = appendixLabel(seen, includedCount)
      seen++
      return label
    })
  }, [items, includedCount])

  const addDocument = () => append(makeAppendixItem() as any, { shouldFocus: false })

  return (
    <div className="space-y-2 py-1">
      <FormField
        control={form.control}
        name="wantsAppendix"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-end space-x-2 space-y-0">
            <FormLabel className="font-normal text-xs cursor-pointer">Include</FormLabel>
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />

      <fieldset disabled={!wantsAppendix} className="space-y-2 group-disabled:opacity-50">
        <p className="text-[11px] text-muted-foreground leading-snug">
          An Appendix may set out statutory provisions, a judgment, or anything else the petition needs on record.
          Attach as many as you need — each gets its own Index entry and its own page numbers.
        </p>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No Appendix documents yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <AppendixRow
                key={item.id || index}
                index={index}
                letter={letters[index]}
                isIncluded={appendixHasContent(item)}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={addDocument}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add {items.length > 0 ? "another " : ""}document
        </Button>
      </fieldset>
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

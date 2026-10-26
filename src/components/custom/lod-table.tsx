
"use client"

import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject } from "@/lib/schema"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlusCircle, Trash2, FileText, GripVertical, Info, FileUp, Plus, Heading } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AnnexureDialog } from "../dialogs/annexure-dialog"
import { BadhiyaBox } from "./badhiya-box"
import { annexureNumbering } from "@/lib/annexure-numbering"
import { annexPrefixFor } from "@/lib/annex-prefix"
import { factsAnnexureSentenceParts } from "@/lib/wp/wp-facts"
import { annexureRowsOf, annexureModeOf } from "@/lib/wp/facts-mode"
import {
  DEFAULT_GROUNDS_HEADING_STYLE,
  HEADING_STYLE_OPTIONS,
  headingLabelFor,
  getFactsHeadingStyle,
  type GroundsHeadingStyle,
} from "@/lib/grounds-headings"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const SortableRow = ({ id, children }: { id: string, children: React.ReactNode }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({id});

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow ref={setNodeRef} style={style} {...attributes} className="border-none">
      <TableCell className="p-0 align-top pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 cursor-grab"
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
      </TableCell>
      {children}
    </TableRow>
  );
};

const ClientSideDnd = ({ children }: { children: React.ReactNode }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : null;
};

// Date cell editor. The Date column is pinned to the width of a single
// "dd.mm.yyyy" (see dateColWidth), so a longer entry — e.g. a date range like
// "dd.mm.yyyy and dd.mm.yyyy" — must wrap onto further lines within that fixed
// width rather than widening the column. A textarea (not an <input>) is used so
// the text wraps; it auto-grows in height to keep every line visible, and Enter
// is suppressed so a date stays one logical line (wrapping is purely visual).
// `name` is preserved so Find & Replace can still locate the field by path.
const DateCellInput = ({
  value,
  onChange,
  onBlur,
  name,
  onInsertRow,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  name?: string;
  onInsertRow: () => void;
}) => {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(autosize, [value]);
  return (
    <textarea
      ref={ref}
      name={name}
      value={value ?? ''}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onInput={autosize}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); onInsertRow(); return; }
        if (e.key === 'Enter') { e.preventDefault(); }
      }}
      className="min-h-7 w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent p-1 text-xs leading-tight border-0 focus-visible:outline-none focus-visible:ring-0"
    />
  );
};

function FactsHeadingStyleControl() {
  const form = useFormContext<DraftoProject>();
  const watched = useWatch({ control: form.control, name: "factsHeadingStyle" as any });
  const style = getFactsHeadingStyle(watched ? { factsHeadingStyle: watched } : form.getValues());

  const set = (patch: Partial<GroundsHeadingStyle>) =>
    form.setValue("factsHeadingStyle" as any, { ...style, ...patch } as any, { shouldDirty: true });

  const FormatToggle = ({
    on, onClick, label, title, className,
  }: { on: boolean; onClick: () => void; label: string; title: string; className?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn(
        "h-6 min-w-[26px] rounded border px-1.5 text-[11px] leading-none transition-colors cursor-pointer",
        on ? "border-primary bg-primary text-primary-foreground dark:text-white" : "border-input bg-background hover:bg-accent",
        className,
      )}
    >
      {label}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground gap-1">
          <Heading className="h-3.5 w-3.5" />
          Heading style
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[230px] space-y-2 p-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Numbering</p>
          <Select value={style.numbering} onValueChange={(v) => set({ numbering: v as GroundsHeadingStyle["numbering"] })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HEADING_STYLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Formatting</p>
          <div className="flex flex-wrap gap-1">
            <FormatToggle on={style.bold} onClick={() => set({ bold: !style.bold })} label="B" title="Bold" className="font-bold" />
            <FormatToggle on={style.italics} onClick={() => set({ italics: !style.italics })} label="I" title="Italics" className="italic font-serif" />
            <FormatToggle on={style.underline} onClick={() => set({ underline: !style.underline })} label="U" title="Underline" className="underline" />
            <FormatToggle on={style.smallCaps} onClick={() => set({ smallCaps: !style.smallCaps })} label="Aa" title="Small capitals" />
            <FormatToggle on={style.allCaps} onClick={() => set({ allCaps: !style.allCaps })} label="AA" title="All capitals" />
          </div>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Applies to every heading in this section.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The dates/particulars/annexures table.
 *
 * Used three ways: as the List of Dates (everything shown), as the concise List
 * of Dates in separate-Facts mode (`hideAnnexures`), and as the Facts table in
 * that same mode (`hideDate`) — where it is the List of Dates table in all but
 * name, which is exactly what was asked for.
 */
export function LoDTable(props: { name?: string; hideDate?: boolean; hideAnnexures?: boolean; allowHeadings?: boolean } = {}) {
  // Remount when the bound path changes — see the note on AamTable.
  return <LoDTableInner {...props} />;
}

function LoDTableInner({
  name = "listOfDates",
  hideDate = false,
  hideAnnexures = false,
  allowHeadings = false,
}: { name?: string; hideDate?: boolean; hideAnnexures?: boolean; allowHeadings?: boolean } = {}) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: name as "listOfDates",
  })

  const [dateColWidth, setDateColWidth] = useState(75);

  const allLods = useWatch({ control: form.control, name: name as "listOfDates" }) || [];

  // Pin the column to exactly one "dd.mm.yyyy" (plus the cell's horizontal
  // padding). Longer entries wrap inside this fixed width instead of widening
  // the column.
  //
  // The date cell is an ordinary field, so it is drawn in the EDITING font and
  // size (--input-font / --input-font-size, set from Settings → Appearance),
  // not in the interface font at text-xs. Measuring the interface font left the
  // column too narrow for every date as soon as the editing text was enlarged,
  // and it never re-measured when that setting changed — the column only
  // caught up when a row happened to be edited.
  useEffect(() => {
    const measure = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const root = getComputedStyle(document.documentElement);
      const rootPx = parseFloat(root.fontSize) || 16;
      const rawSize = root.getPropertyValue('--input-font-size').trim();
      const sizePx = rawSize.endsWith('rem')
        ? parseFloat(rawSize) * rootPx
        : parseFloat(rawSize) || 0.75 * rootPx;
      const family = root.getPropertyValue('--input-font').trim() || 'Arial, Helvetica, sans-serif';
      ctx.font = `${sizePx}px ${family}`;
      const oneDateWidth = ctx.measureText('00.00.0000').width;
      setDateColWidth(Math.ceil(oneDateWidth) + 16);
    };
    measure();
    // Settings writes the font variables onto the root element, so watching its
    // style attribute is what keeps the column in step, live.
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, [allLods]);
  
  const courtType = useWatch({ control: form.control, name: "courtType" });
  const prefix = annexPrefixFor(courtType);

  const [showAnnexureSentences, setShowAnnexureSentences] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem("drafto-show-annexure-sentences") === "true";
    }
    return false;
  });

  const toggleShowAnnexureSentences = (checked: boolean) => {
    setShowAnnexureSentences(checked);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("drafto-show-annexure-sentences", String(checked));
    }
  };

  const switchId = useMemo(() => `show-annex-sentences-${name.replace(/[^a-zA-Z0-9]/g, "-")}`, [name]);

  // One shared rule (see lib/annexure-numbering.ts): position decides the
  // number, the tool's group rule decides the grouping. Reads from the authoritative
  // annexure table (LoD or Facts depending on annexureMode) so numbers always match.
  const proj = form.getValues();
  const masterRows = annexureRowsOf(proj);
  const annexureNumberingMap = useMemo(
    () => annexureNumbering(masterRows.length ? masterRows : allLods, courtType),
    [masterRows, allLods, courtType]
  );

  const getRowAnnexures = (lod: any) => {
    if (lod?.annexures && lod.annexures.length > 0) return lod.annexures;
    if (name !== "listOfDates" && annexureModeOf(form.getValues()) === "lod") {
      const match = (form.getValues("listOfDates") || []).find((l: any) => l.id === lod.id);
      return match?.annexures || [];
    }
    return [];
  };

  const hasAnyAnnexures = useMemo(() => {
    return allLods.some((lod: any) => getRowAnnexures(lod).length > 0);
  }, [allLods, name]);

  const getAnnexureLabel = (lodId: string) => {
    const targetLod = allLods.find(lod => lod.id === lodId);
    const annexuresInRow = getRowAnnexures(targetLod);
    if (annexuresInRow.length === 0) return <FileText className="h-4 w-4" />;
    
    const numbers = annexuresInRow
      .map(annex => annexureNumberingMap.get(annex.id))
      .filter(Boolean); // filter out undefined if any

    if (numbers.length === 0) return <FileText className="h-4 w-4" />;
    
    return `${prefix}-${numbers.join(', ')}`;
  }
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;
    
    if (active.id !== over?.id) {
      const oldIndex = fields.findIndex(field => field.id === active.id);
      const newIndex = fields.findIndex(field => field.id === over!.id);
      move(oldIndex, newIndex);
    }
  }

  const watchedFactsHeadingStyle = useWatch({ control: form.control, name: "factsHeadingStyle" as any });
  const factsHeadingStyle = getFactsHeadingStyle(watchedFactsHeadingStyle ? { factsHeadingStyle: watchedFactsHeadingStyle } : form.getValues());

  const insertHeadingAt = (index: number) => {
    const id = `item_${Date.now()}`;
    insert(index, { id, isHeading: true, heading: "", date: "", event: "", annexures: [] });
  };

  const InsertHeadingStrip = ({ at }: { at: number }) => (
    <TableRow className="border-none">
      <TableCell colSpan={hideDate ? 4 : 5} className="p-0">
        <button
          type="button"
          onClick={() => insertHeadingAt(at)}
          className="group/ins relative flex h-3 w-full items-center opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
          title="Insert a heading here"
        >
          <span className="h-px w-full bg-border" />
          <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-background px-1.5 text-[9px] leading-[13px] text-muted-foreground">
            <Plus className="mr-0.5 inline h-2.5 w-2.5" />heading
          </span>
        </button>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 pb-0.5">
        <div>
          {allowHeadings && <FactsHeadingStyleControl />}
        </div>
        {(!hideAnnexures || hasAnyAnnexures) && (
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={showAnnexureSentences}
              onCheckedChange={toggleShowAnnexureSentences}
              className="scale-75 origin-right"
            />
            <Label
              htmlFor={switchId}
              className="text-xs text-muted-foreground font-normal cursor-pointer select-none"
            >
              Show Annexure Sentences
            </Label>
          </div>
        )}
      </div>
      <div className="rounded-md">
        <ClientSideDnd>
          <DndContext
            id={`dnd-${name}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-none">
                  <TableHead className="w-[30px] p-0 text-xs"></TableHead>
                  {!hideDate && (
                  <TableHead className="text-center p-0 text-xs" style={{ width: dateColWidth, minWidth: dateColWidth }}>
                    <span className="inline-flex items-center gap-0.5">
                      Date
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none">
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[220px] text-xs text-center">
                            Drag to reorder rows. Ctrl + Space to enter a new, blank row after the current row.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                  </TableHead>
                  )}
                  <TableHead className="text-center p-0 text-xs">Particulars</TableHead>
                  {!hideAnnexures && (
                  <TableHead className="w-[20px] text-center p-0 text-xs">
                    <span className="inline-flex items-center gap-0.5">
                      Annex
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus:outline-none">
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[240px] text-xs text-center">
                            Please mark annexures in chronological order. Check the AD box if the annexure was not part of the record of the High Court.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                  </TableHead>
                  )}
                  <TableHead className="w-[20px] text-center p-0 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <SortableContext
                items={fields}
                strategy={verticalListSortingStrategy}
              >
                <TableBody>
                  {fields.map((item, index) => {
                    const currentLod = allLods[index];
                    const isHeading = allowHeadings && !!currentLod?.isHeading;

                    if (isHeading) {
                      return (
                        <React.Fragment key={item.id}>
                          {allowHeadings && <InsertHeadingStrip at={index} />}
                          <SortableRow id={item.id}>
                            <TableCell className="font-medium text-xs align-middle p-0 text-center text-muted-foreground">
                              {headingLabelFor(allLods as any, index, factsHeadingStyle)}
                            </TableCell>
                            <TableCell colSpan={hideDate ? 1 : 2} className="p-0">
                              <FormField
                                control={form.control}
                                name={`${name}.${index}.heading`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        placeholder="Heading"
                                        style={factsHeadingStyle.smallCaps ? { fontVariant: "small-caps" } : undefined}
                                        className={cn(
                                          "h-7 border-dashed bg-muted/40 text-xs tracking-wide text-justify",
                                          factsHeadingStyle.bold && "font-semibold",
                                          factsHeadingStyle.italics && "italic",
                                          factsHeadingStyle.underline && "underline",
                                          factsHeadingStyle.allCaps && "uppercase"
                                        )}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            {!hideAnnexures && <TableCell className="p-0" />}
                            <TableCell className="align-top pt-1 p-0 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive h-7 w-7"
                                onClick={() => remove(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </SortableRow>
                        </React.Fragment>
                      );
                    }

                    const rowAnnexures = getRowAnnexures(currentLod);
                    const hasAnnexures = rowAnnexures.length > 0;
                    return (
                      <React.Fragment key={item.id}>
                        {allowHeadings && <InsertHeadingStrip at={index} />}
                        <SortableRow id={item.id}>
                        {!hideDate && (
                        <TableCell className="align-top pt-2 p-0" style={{ width: dateColWidth, minWidth: dateColWidth }}>
                          <FormField
                            control={form.control}
                            name={`${name}.${index}.date`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <DateCellInput
                                    name={field.name}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    onInsertRow={() => insert(index + 1, { id: `lod_${Date.now()}`, date: "", event: "", annexures: [] })}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        )}
                        <TableCell className="align-top p-0">
                          <FormField
                            control={form.control}
                            name={`${name}.${index}.event`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <BadhiyaBox
                                    value={field.value}
                                    onChange={field.onChange}
                                    path={field.name}
                                    onCtrlSpace={() => insert(index + 1, { id: `lod_${Date.now()}`, date: "", event: "", annexures: [] })}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          {showAnnexureSentences && hasAnnexures && (
                            <div className="px-2 py-1.5 space-y-1 bg-muted/25 rounded border border-dashed border-border/60 my-1 mx-1 select-text">
                              {rowAnnexures.map((annex: any) => {
                                const pNumber = annexureNumberingMap.get(annex.id);
                                if (pNumber === undefined) return null;
                                const { label, rest } = factsAnnexureSentenceParts(pNumber, annex, prefix);
                                return (
                                  <p key={annex.id} className="text-xs text-neutral-600 dark:text-neutral-400 font-normal leading-relaxed">
                                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">{label}</span>
                                    <span>{rest}</span>
                                  </p>
                                );
                              })}
                            </div>
                          )}
                        </TableCell>
                        {!hideAnnexures && (
                        <TableCell className="align-top pt-1 p-0 text-center">
                          <AnnexureDialog lodIndex={index} annexureNumberingMap={annexureNumberingMap} rowsName={name}>
                            <Button 
                              variant="ghost"
                              size="sm" 
                              className={cn(
                                "h-7 justify-center border-0 text-xs w-full",
                                hasAnnexures && "bg-accent/20 text-accent-foreground dark:text-green-200 hover:bg-accent/30"
                              )}
                            >
                              {getAnnexureLabel(item.id)}
                            </Button>
                          </AnnexureDialog>
                        </TableCell>
                        )}
                        <TableCell className="align-top pt-1 p-0 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-7 w-7"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </SortableRow>
                      </React.Fragment>
                    )
                  })}
                  {allowHeadings && fields.length > 0 && <InsertHeadingStrip at={fields.length} />}
                   {fields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground p-0">
                          No items.
                        </TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </SortableContext>
            </Table>
          </DndContext>
        </ClientSideDnd>
      </div>
       <div className="flex items-center gap-2">
         <Button
           type="button"
           variant="outline"
           size="icon"
           className="h-7 w-7"
           title="Add Row"
           onClick={() => append({ id: `lod_${Date.now()}`, date: "", event: "", annexures: [] })}
         >
           <PlusCircle className="h-4 w-4" />
         </Button>
         {allowHeadings && (
           <Button
             type="button"
             variant="outline"
             size="sm"
             className="h-7 text-xs gap-1"
             title="Add Heading"
             onClick={() => append({ id: `item_${Date.now()}`, isHeading: true, heading: "", date: "", event: "", annexures: [] })}
           >
             <Heading className="h-3.5 w-3.5" />
             Add Heading
           </Button>
         )}
         <Button
           type="button"
           variant="ghost"
           size="sm"
           className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
           title="Import dates and annexures from another project"
           onClick={() => window.dispatchEvent(new CustomEvent("drafto-open-import-dialog"))}
         >
           <FileUp className="h-3.5 w-3.5" />
           Import from Project…
         </Button>
       </div>
    </div>
  )
}

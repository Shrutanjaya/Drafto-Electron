
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
import { PlusCircle, Trash2, GripVertical, Heading, Plus } from "lucide-react"
import { BadhiyaBox } from "./badhiya-box"
import {
  DEFAULT_GROUNDS_HEADING_STYLE,
  HEADING_STYLE_OPTIONS,
  headingLabelFor,
  type GroundsHeadingStyle,
  type GroundsRow,
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
import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react"

type AamTableName = "grounds" | "questionsOfLaw" | "interimReliefGrounds" | "interimReliefPrayers" | "standardIas.additionalDocumentsGrounds" | "customIas.0.grounds" | "customIas.0.prayers" | "customIas.1.grounds" | "customIas.1.prayers" | "customIas.2.grounds" | "customIas.2.prayers" | "customIas.3.grounds" | "customIas.3.prayers" | "customIas.4.grounds" | "customIas.4.prayers"
  // Writ Petition (Delhi HC) paths
  | "wp.reliefs"
  | "wp.cms.stay.body" | "wp.cms.lengthySynopsis.body" | "wp.cms.exemptionCopies.body"
  | "wp.cms.stay.prayers" | "wp.cms.lengthySynopsis.prayers" | "wp.cms.exemptionCopies.prayers"
  | `wp.customCms.${number}.grounds` | `wp.customCms.${number}.prayers`
  // CAT Original Application paths
  | "oa.reliefs" | "oa.interimReliefs"
  | `oa.mas.${number}.body`

interface AamTableProps {
    name: AamTableName;
    defaultRows?: number;
    disabled?: boolean;
    // Row label style. "alpha" (default) shows A, B, C… "numeric" shows running
    // paragraph numbers starting at `numericStart` — used by the Additional
    // Documents IA, whose grounds become numbered paras (3, 4, 5…) in the docx.
    labelMode?: "alpha" | "numeric";
    numericStart?: number;
    // Grounds tables let the user place headings between the rows. A heading is
    // a row of this same list (see lib/grounds-headings.ts); it takes no letter,
    // so the lettering runs on across it.
    allowHeadings?: boolean;
}

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


// Style and formatting for the headings in this section — one choice for all of
// them (a sequence in mixed styles would be wrong, and it keeps the editor
// uncluttered). Tucked into a popover so it costs one small button on screen.
function HeadingStyleControl() {
  const form = useFormContext<DraftoProject>();
  const style = {
    ...DEFAULT_GROUNDS_HEADING_STYLE,
    ...((useWatch({ control: form.control, name: "groundsHeadingStyle" as any }) || {}) as Partial<GroundsHeadingStyle>),
  } as GroundsHeadingStyle;

  const set = (patch: Partial<GroundsHeadingStyle>) =>
    form.setValue("groundsHeadingStyle" as any, { ...style, ...patch } as any, { shouldDirty: true });

  const FormatToggle = ({
    on, onClick, label, title, className,
  }: { on: boolean; onClick: () => void; label: string; title: string; className?: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn(
        "h-6 min-w-[26px] rounded border px-1.5 text-[11px] leading-none transition-colors",
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
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground">
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
          Applies to every heading in this section. The grounds keep their own lettering, running on across headings.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A table of rows bound to `name`.
 *
 * The wrapper exists to force a remount whenever `name` changes. These tables
 * are often bound to an indexed path — `oa.mas.2.body` — and the array ABOVE
 * them can be reordered or have an entry removed. The field-array inside keeps
 * its own copy of the rows keyed to the path it mounted with, so after such a
 * move it is pointing at one application's data while displaying another's, and
 * the user sees their content vanish. Remounting on a path change forces a fresh
 * read of whatever now lives there.
 */
export function AamTable(props: AamTableProps) {
  return <AamTableInner key={props.name} {...props} />;
}

function AamTableInner({ name, defaultRows = 10, disabled = false, labelMode = "alpha", numericStart = 1, allowHeadings = false }: AamTableProps) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: name,
  })

  // Id of a just-inserted row whose editor should grab focus. Cleared implicitly
  // once matched (ids are unique, so it focuses exactly one row, once).
  const [focusId, setFocusId] = useState<string | null>(null);
  const insertAfter = (index: number) => {
    const id = `item_${Date.now()}`;
    insert(index + 1, { id, particulars: "" });
    setFocusId(id);
  };

  // What the labels need to know about the rows — and NOTHING more. Watching the
  // whole array would re-render every rich-text editor in the table on each
  // keystroke, so this subscribes to the heading titles alone: whether a row is
  // a heading never changes after it is created, so that comes from the field
  // array's own (structural) snapshot.
  const headingRowIndexes = React.useMemo(
    () => fields.map((f: any, i: number) => (f?.isHeading ? i : -1)).filter((i) => i >= 0),
    [fields],
  );
  const headingTexts = (useWatch({
    control: form.control,
    name: headingRowIndexes.map((i) => `${name}.${i}.heading`) as any,
    disabled: !allowHeadings || headingRowIndexes.length === 0,
  }) as (string | undefined)[] | undefined) ?? [];

  // A labelling-only view of the rows. Ground text is stood in for, because no
  // label depends on it: the letters go by position and the heading numbers by
  // the headings before them.
  const labelRows: GroundsRow[] = React.useMemo(
    () =>
      fields.map((f: any, i: number) => {
        if (!f?.isHeading) return { particulars: "-" };
        const at = headingRowIndexes.indexOf(i);
        return { isHeading: true, heading: (at >= 0 ? headingTexts[at] : undefined) ?? f.heading ?? "" };
      }),
    [fields, headingRowIndexes, headingTexts],
  );

  const headingStyle = {
    ...DEFAULT_GROUNDS_HEADING_STYLE,
    ...((useWatch({ control: form.control, name: "groundsHeadingStyle" as any }) || {}) as Partial<GroundsHeadingStyle>),
  } as GroundsHeadingStyle;

  const insertHeadingAt = (index: number) => {
    const id = `item_${Date.now()}`;
    insert(index, { id, particulars: "", isHeading: true, heading: "" });
    setFocusId(id);
  };

  // A heading takes no letter, so the grounds either side of it carry on: the
  // letter is the row's position among the NON-heading rows.
  const rowLabel = (index: number): string => {
    let ordinal = 0;
    for (let i = 0; i < index; i++) if (!labelRows[i]?.isHeading) ordinal++;
    return labelMode === "numeric" ? `${numericStart + ordinal}.` : String.fromCharCode(65 + ordinal);
  };

  // A thin strip between two rows: invisible until pointed at, so the table
  // stays as quiet as it is today.
  const InsertHeadingStrip = ({ at }: { at: number }) => (
    <TableRow className="border-none">
      <TableCell colSpan={4} className="p-0">
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
      if (oldIndex < 0 || newIndex < 0) return;

      // Snapshot BEFORE the move, then re-assert the intended order afterwards.
      //
      // The field array's own move() reorders its internal copy, but where this
      // table is bound inside an array the form does not track as a field array
      // — oa.mas.<n>.body, the CAT applications — the rows that changed index
      // could come back with no value at all. Every editor from the drop point
      // down then read "nothing", blanked itself, and wrote that blank back:
      // drag row D above row C and both lost their text.
      //
      // Writing the reordered array explicitly makes the stored data
      // authoritative. It is idempotent: where move() already did the right
      // thing, this writes exactly the same array.
      const before = (form.getValues(name) as any[] | undefined)?.map((r) => ({ ...r })) ?? [];
      move(oldIndex, newIndex);
      if (before.length > 0) {
        form.setValue(name as any, arrayMove(before, oldIndex, newIndex) as any, { shouldDirty: true });
      }
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-1 group">
      <div className="rounded-md group-disabled:opacity-50 group-disabled:blur-sm">
        <ClientSideDnd>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow className="border-none">
                  <TableHead className="w-[30px] p-0 text-xs"></TableHead>
                  <TableHead className="w-[30px] text-center p-0 text-xs"></TableHead>
                  <TableHead className="text-center p-0 text-xs">Particulars</TableHead>
                  <TableHead className="w-[30px] text-center p-0 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <SortableContext
                items={fields}
                strategy={verticalListSortingStrategy}
              >
                <TableBody>
                    {fields.map((item, index) => {
                      const isHeading = allowHeadings && !!labelRows[index]?.isHeading;
                      return (
                      <React.Fragment key={item.id}>
                      {allowHeadings && <InsertHeadingStrip at={index} />}
                      <SortableRow id={item.id}>
                        <TableCell className={cn("font-medium text-xs align-middle p-0 text-center", isHeading && "text-muted-foreground")}>
                          {isHeading ? headingLabelFor(labelRows, index, headingStyle) : rowLabel(index)}
                        </TableCell>
                        <TableCell className="p-0">
                          {isHeading ? (
                            // The heading is shown the way it will print, so the
                            // formatting choice is visible where it is made.
                            <FormField
                              control={form.control}
                              name={`${name}.${index}.heading` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      value={field.value ?? ""}
                                      disabled={disabled}
                                      autoFocus={item.id === focusId}
                                      placeholder="Heading"
                                      style={headingStyle.smallCaps ? { fontVariant: "small-caps" } : undefined}
                                      className={cn(
                                        "h-7 border-dashed bg-muted/40 text-xs tracking-wide",
                                        headingStyle.bold && "font-semibold",
                                        headingStyle.italics && "italic",
                                        headingStyle.underline && "underline",
                                        headingStyle.allCaps && "uppercase",
                                      )}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ) : (
                            <FormField
                              control={form.control}
                              name={`${name}.${index}.particulars`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <BadhiyaBox
                                      value={field.value}
                                      onChange={field.onChange}
                                      disabled={disabled}
                                      path={field.name}
                                      autoFocus={item.id === focusId}
                                      onCtrlSpace={() => insertAfter(index)}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          )}
                        </TableCell>
                        <TableCell className="p-0">
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
                    })}
                    {allowHeadings && fields.length > 0 && <InsertHeadingStrip at={fields.length} />}
                </TableBody>
              </SortableContext>
              {fields.length === 0 && (
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground p-0">
                      No items.
                    </TableCell>
                  </TableRow>
                </TableBody>
              )}
            </Table>
          </DndContext>
        </ClientSideDnd>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => append({ id: `item_${Date.now()}`, particulars: "" })}
          title="Add a row"
        >
          <PlusCircle className="h-4 w-4" />
        </Button>
        {allowHeadings && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => insertHeadingAt(fields.length)}
              title="Add a heading at the end (or use the line between any two rows)"
            >
              <Heading className="h-3.5 w-3.5" />
              Heading
            </Button>
            <HeadingStyleControl />
          </>
        )}
      </div>
    </fieldset>
  )
}

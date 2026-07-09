
"use client"

import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject, Annexure } from "@/lib/schema"
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
import { PlusCircle, Trash2, FileText, GripVertical, Info } from "lucide-react"
import { AnnexureDialog } from "../dialogs/annexure-dialog"
import { BadhiyaBox } from "./badhiya-box"
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

export function LoDTable() {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: "listOfDates",
  })

  const [dateColWidth, setDateColWidth] = useState(75);

  const allLods = useWatch({ control: form.control, name: "listOfDates" });

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // text-xs = 0.75rem; read the actual root font-size to account for Small/Medium/Large setting
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const textXsPx = 0.75 * rootPx;
    ctx.font = `${textXsPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    // Pin the column to exactly one "dd.mm.yyyy" (plus the cell's horizontal
    // padding). Longer entries wrap inside this fixed width instead of widening
    // the column; the width tracks the current font-size setting.
    const oneDateWidth = ctx.measureText('00.00.0000').width;
    setDateColWidth(Math.ceil(oneDateWidth) + 16);
  }, [allLods]);
  
  const annexureNumberingMap = useMemo(() => {
    const map = new Map<string, number>();
    const allAnnexures: Annexure[] = [];

    allLods.forEach(lod => {
      if (lod.annexures) {
        allAnnexures.push(...lod.annexures);
      }
    });

    const nonAdAnnexures = allAnnexures.filter(annex => !annex.isAdditionalDocument);
    const adAnnexures = allAnnexures.filter(annex => annex.isAdditionalDocument);

    let counter = 1;
    nonAdAnnexures.forEach(annex => {
      map.set(annex.id, counter++);
    });
    adAnnexures.forEach(annex => {
      map.set(annex.id, counter++);
    });
    
    return map;
  }, [allLods]);

  const getAnnexureLabel = (lodId: string) => {
    const annexuresInRow = allLods.find(lod => lod.id === lodId)?.annexures || [];
    if (annexuresInRow.length === 0) return <FileText className="h-4 w-4" />;
    
    const numbers = annexuresInRow
      .map(annex => annexureNumberingMap.get(annex.id))
      .filter(Boolean); // filter out undefined if any

    if (numbers.length === 0) return <FileText className="h-4 w-4" />;
    
    return `P-${numbers.join(', ')}`;
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

  return (
    <div className="space-y-1">
      <div className="rounded-md">
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
                  <TableHead className="text-center p-0 text-xs">Particulars</TableHead>
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
                    const hasAnnexures = currentLod?.annexures && currentLod.annexures.length > 0;
                    return (
                      <SortableRow key={item.id} id={item.id}>
                        <TableCell className="align-top pt-2 p-0" style={{ width: dateColWidth, minWidth: dateColWidth }}>
                          <FormField
                            control={form.control}
                            name={`listOfDates.${index}.date`}
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
                        <TableCell className="align-top p-0">
                          <FormField
                            control={form.control}
                            name={`listOfDates.${index}.event`}
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
                        </TableCell>
                        <TableCell className="align-top pt-1 p-0 text-center">
                          <AnnexureDialog lodIndex={index} annexureNumberingMap={annexureNumberingMap}>
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
                    )
                  })}
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
       <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => append({ id: `lod_${Date.now()}`, date: "", event: "", annexures: [] })}
        >
          <PlusCircle className="h-4 w-4" />
        </Button>
    </div>
  )
}

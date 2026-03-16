
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
import { PlusCircle, Trash2, FileText, GripVertical } from "lucide-react"
import { AnnexureDialog } from "../dialogs/annexure-dialog"
import { Input } from "../ui/input"
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"

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

export function LoDTable() {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: "listOfDates",
  })

  const [dateColWidth, setDateColWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('lod-date-col-width');
      if (saved) return Number(saved);
    }
    return 75;
  });

  useEffect(() => {
    sessionStorage.setItem('lod-date-col-width', String(dateColWidth));
  }, [dateColWidth]);
  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startWidth: dateColWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      setDateColWidth(Math.max(40, resizingRef.current.startWidth + delta));
    };
    const onMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [dateColWidth]);

  const allLods = useWatch({ control: form.control, name: "listOfDates" });
  
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
                  <TableHead className="text-center p-0 text-xs relative overflow-visible" style={{ width: dateColWidth, minWidth: dateColWidth }}>
                    Date
                    <div
                      onMouseDown={onResizeMouseDown}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-border"
                    />
                  </TableHead>
                  <TableHead className="text-center p-0 text-xs">Particulars</TableHead>
                  <TableHead className="w-[20px] text-center p-0 text-xs">Annex</TableHead>
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
                                  <Input {...field} className="h-7 p-1 text-xs border-0 focus-visible:ring-0" onKeyDown={(e) => { if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); insert(index + 1, { id: `lod_${Date.now()}`, date: "", event: "", annexures: [] }); } }}/>
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

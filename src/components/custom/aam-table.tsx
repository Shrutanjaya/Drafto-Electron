
"use client"

import { useFieldArray, useFormContext } from "react-hook-form"
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
import { PlusCircle, Trash2, GripVertical } from "lucide-react"
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
import React, { useEffect, useState } from "react"

type AamTableName = "grounds" | "questionsOfLaw" | "interimReliefGrounds" | "interimReliefPrayers" | "standardIas.additionalDocumentsGrounds" | "customIas.0.grounds" | "customIas.0.prayers" | "customIas.1.grounds" | "customIas.1.prayers" | "customIas.2.grounds" | "customIas.2.prayers" | "customIas.3.grounds" | "customIas.3.prayers" | "customIas.4.grounds" | "customIas.4.prayers"

interface AamTableProps {
    name: AamTableName;
    defaultRows?: number;
    disabled?: boolean;
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


export function AamTable({ name, defaultRows = 10, disabled = false }: AamTableProps) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: name,
  })

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
                    {fields.map((item, index) => (
                      <SortableRow key={item.id} id={item.id}>
                        <TableCell className="font-medium text-xs align-middle p-0 text-center">{String.fromCharCode(65 + index)}</TableCell>
                        <TableCell className="p-0">
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
                                    onCtrlSpace={() => insert(index + 1, { id: `item_${Date.now()}`, particulars: "" })}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
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
                    ))}
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
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={() => append({ id: `item_${Date.now()}`, particulars: "" })}
      >
        <PlusCircle className="h-4 w-4" />
      </Button>
    </fieldset>
  )
}

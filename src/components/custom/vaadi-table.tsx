
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
import { Input } from "../ui/input"

type VaadiTableName = "petitioners" | "respondents";

interface VaadiTableProps {
    name: VaadiTableName;
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

export function VaadiTable({ name, disabled = false }: VaadiTableProps) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move } = useFieldArray({
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
                  <TableHead className="text-center p-0 text-xs">Name</TableHead>
                  <TableHead className="text-center p-0 text-xs">Address</TableHead>
                  <TableHead className="text-center p-0 text-xs">Position in Earlier Court</TableHead>
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
                        <TableCell className="font-medium text-xs align-middle p-0 text-center">{index + 1}</TableCell>
                        <TableCell className="p-0">
                          <FormField
                            control={form.control}
                            name={`${name}.${index}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} className="h-7 p-1 text-xs border-0 focus-visible:ring-0" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="p-0">
                          <FormField
                            control={form.control}
                            name={`${name}.${index}.address`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} className="h-7 p-1 text-xs border-0 focus-visible:ring-0" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="p-0">
                          <FormField
                            control={form.control}
                            name={`${name}.${index}.positionInEarlierCourt`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} className="h-7 p-1 text-xs border-0 focus-visible:ring-0" />
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
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground p-0">
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
        onClick={() => append({ id: `vaadi_${Date.now()}`, name: "", address: "", positionInEarlierCourt: "" })}
      >
        <PlusCircle className="h-4 w-4" />
      </Button>
    </fieldset>
  )
}

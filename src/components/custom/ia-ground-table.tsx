
"use client"

import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import type { DraftoProject, IaAnnexure } from "@/lib/schema"
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
import { IaAnnexureDialog } from "./ia-annexure-dialog"

type IaGroundTableName = "standardIas.condonationOfDelay.grounds" | `customIas.${number}.grounds` | "standardIas.exemptionFromSurrendering.grounds" | `wp.customCms.${number}.grounds`;

interface IaGroundTableProps {
    name: IaGroundTableName;
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

export function IaGroundTable({ name, disabled = false }: IaGroundTableProps) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: name,
  })

  const allGrounds = useWatch({ control: form.control, name: name });
  
  const annexureNumberingMap = useMemo(() => {
    const map = new Map<string, number>();
    const allAnnexures: IaAnnexure[] = [];

    allGrounds.forEach(ground => {
      if (ground.annexures) {
        allAnnexures.push(...ground.annexures);
      }
    });

    let counter = 1;
    allAnnexures.forEach(annex => {
      map.set(annex.id, counter++);
    });
    
    return map;
  }, [allGrounds]);

  const getAnnexureLabel = (groundId: string) => {
    const annexuresInRow = allGrounds.find(g => g.id === groundId)?.annexures || [];
    if (annexuresInRow.length === 0) return <FileText className="h-4 w-4" />;
    
    const numbers = annexuresInRow
      .map(annex => annexureNumberingMap.get(annex.id))
      .filter(Boolean);

    if (numbers.length === 0) return <FileText className="h-4 w-4" />;
    
    return `A-${numbers.join(', ')}`;
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
                  <TableHead className="w-[20px] text-center p-0 text-xs">Annex</TableHead>
                  <TableHead className="w-[30px] text-center p-0 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <SortableContext
                items={fields}
                strategy={verticalListSortingStrategy}
              >
                <TableBody>
                    {fields.map((item, index) => {
                      const currentGround = allGrounds[index];
                      const hasAnnexures = currentGround?.annexures && currentGround.annexures.length > 0;
                      return (
                        <SortableRow key={item.id} id={item.id}>
                          <TableCell className="font-medium text-xs align-top pt-2 p-0 text-center">{String.fromCharCode(65 + index)}</TableCell>
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
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </TableCell>
                          <TableCell className="align-top pt-1 p-0 text-center">
                            <IaAnnexureDialog 
                              groundIndex={index}
                              nestingKey={name as "standardIas.condonationOfDelay.grounds"} // This is a bit of a hack, but should work for now
                              annexureNumberingMap={annexureNumberingMap}
                            >
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
                            </IaAnnexureDialog>
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
                      );
                    })}
                </TableBody>
              </SortableContext>
              {fields.length === 0 && (
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground p-0">
                      No grounds.
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
        onClick={() => append({ particulars: "" })}
      >
        <PlusCircle className="h-4 w-4" />
      </Button>
    </fieldset>
  )
}


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

function AamTableInner({ name, defaultRows = 10, disabled = false, labelMode = "alpha", numericStart = 1 }: AamTableProps) {
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
                    {fields.map((item, index) => (
                      <SortableRow key={item.id} id={item.id}>
                        <TableCell className="font-medium text-xs align-middle p-0 text-center">{labelMode === "numeric" ? `${numericStart + index}.` : String.fromCharCode(65 + index)}</TableCell>
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
                                    autoFocus={item.id === focusId}
                                    onCtrlSpace={() => insertAfter(index)}
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

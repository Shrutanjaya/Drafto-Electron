
"use client"

import { useFieldArray, useFormContext } from "react-hook-form"
import type { DraftoProject } from "@/lib/schema"
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useState } from "react"
import { Textarea } from "../ui/textarea"

type VaadiTableName =
  | "petitioners"
  | "respondents"
  | `commonOrderParties.${number}.petitioners`
  | `commonOrderParties.${number}.respondents`;

interface VaadiTableProps {
    name: VaadiTableName;
    disabled?: boolean;
    // WP mode: writs are original proceedings, so "Position in the Court Below"
    // is hidden and a "Through …" service designation (Memo of Parties) shows.
    showPosition?: boolean;
    showThrough?: boolean;
    // WP mode overrides: custom placeholder for the Through field, and an
    // icon-only "add" button (no "Add Party" caption).
    throughPlaceholder?: string;
    compactAdd?: boolean;
    // CAT: each Applicant signs their own last page / vakalatnama / affidavit,
    // so each needs their own deponent particulars.
    showDeponentDetails?: boolean;
    // PIL: the disclosures Order XXXVIII Rule 12(1)(d) requires of a public
    // interest petitioner, printed as the Para 2 particulars table.
    showPilDetails?: boolean;
}

// Auto-growing single-field cell. The field name is shown as in-field preview
// (placeholder) text rather than a separate caption above the field.
const PartyField = ({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) => {
  const form = useFormContext<DraftoProject>();
  return (
    <FormField
      control={form.control}
      name={name as "petitioners.0.name"}
      render={({ field }) => (
        <FormItem className="space-y-0">
          <FormControl>
            <Textarea
              {...field}
              placeholder={placeholder ?? label}
              ref={(el) => { field.ref(el); if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              rows={1}
              className="p-1.5 text-xs min-h-0 overflow-hidden resize-none leading-snug"
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
};

const SortableCard = ({
  id,
  index,
  name,
  onRemove,
  showPosition = true,
  showThrough = false,
  throughPlaceholder,
  showDeponentDetails = false,
  showPilDetails = false,
}: {
  id: string;
  index: number;
  name: string;
  onRemove: () => void;
  showPosition?: boolean;
  showThrough?: boolean;
  throughPlaceholder?: string;
  showDeponentDetails?: boolean;
  showPilDetails?: boolean;
}) => {
  const form = useFormContext<DraftoProject>();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
  };
  // Before a tribunal the petitioning party is the Applicant.
  const courtType = form.watch("courtType");
  const roleLabel = name.endsWith('respondents')
    ? 'Respondent'
    : (courtType === "OriginalApplicationCAT" ? 'Applicant' : 'Petitioner');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border bg-card shadow-sm"
    >
      <div className="flex items-center gap-1 border-b bg-muted/40 px-1.5 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-semibold text-muted-foreground">{roleLabel} No. {index + 1}</span>
        <div className="flex-grow" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2 p-2">
        <PartyField name={`${name}.${index}.name`} label="Name" />
        {showThrough && <PartyField name={`${name}.${index}.through`} label="Through (e.g. its Standing Counsel) — optional" placeholder={throughPlaceholder} />}
        <PartyField name={`${name}.${index}.address`} label="Address" />
        {showPosition && <PartyField name={`${name}.${index}.positionInEarlierCourt`} label="Position in the Court Below" />}
        {showPilDetails && (
          <>
            <PartyField name={`${name}.${index}.phone`} label="Phone Number" />
            <PartyField name={`${name}.${index}.aadhaar`} label="Aadhaar Number" />
            <PartyField name={`${name}.${index}.occupation`} label="Occupation" />
            <PartyField name={`${name}.${index}.annualIncome`} label="Annual Income" />
            <PartyField name={`${name}.${index}.pan`} label="PAN Number" />
            <PartyField name={`${name}.${index}.cin`} label="CIN Number" />
            <PartyField name={`${name}.${index}.email`} label="Email ID" />
          </>
        )}
        {showDeponentDetails && (
          <div className="grid grid-cols-3 gap-1.5">
            <PartyField name={`${name}.${index}.relationship`} label="son of / daughter of / wife of" />
            <PartyField name={`${name}.${index}.fatherName`} label="Father's / Spouse's name" />
            <PartyField name={`${name}.${index}.age`} label="Age" />
          </div>
        )}
      </div>
    </div>
  );
};

const ClientSideDnd = ({ children }: { children: React.ReactNode }) => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient ? <>{children}</> : null;
};

export function VaadiTable({ name, disabled = false, showPosition = true, showThrough = false, throughPlaceholder, compactAdd = false, showDeponentDetails = false, showPilDetails = false }: VaadiTableProps) {
  const form = useFormContext<DraftoProject>()
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: name as "petitioners",
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
    <fieldset disabled={disabled} className="space-y-2 group">
      <div className="group-disabled:opacity-50 group-disabled:blur-sm">
        <ClientSideDnd>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={fields} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {fields.map((item, index) => (
                  <SortableCard
                    key={item.id}
                    id={item.id}
                    index={index}
                    name={name}
                    onRemove={() => remove(index)}
                    showPosition={showPosition}
                    showThrough={showThrough}
                    showPilDetails={showPilDetails}
                    throughPlaceholder={throughPlaceholder}
                    showDeponentDetails={showDeponentDetails}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ClientSideDnd>
        {fields.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No parties added yet.
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => append({ id: `vaadi_${Date.now()}`, name: "", address: "", positionInEarlierCourt: "", through: "" })}
        title="Add party"
        aria-label="Add party"
      >
        <PlusCircle className={compactAdd ? "h-4 w-4" : "mr-1.5 h-4 w-4"} />{!compactAdd && "Add Party"}
      </Button>
    </fieldset>
  )
}


"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { DraftoProject } from "@/lib/schema";
import { checklistQueries, CHECKLIST_DECLARATION } from "@/lib/checklist-queries";

type ChecklistKey = keyof DraftoProject['checklist'];
type ChecklistValue = "Yes" | "No" | "NA";

const ChecklistItem = ({ name, label, options, sub }: { name: ChecklistKey; label: string; options: ChecklistValue[]; sub?: boolean }) => (
  <FormField
    name={`checklist.${name}`}
    render={({ field }) => (
      <FormItem className="flex items-center justify-between space-x-2 py-1 border-b">
        <FormLabel className={`text-xs font-normal ${sub ? 'pl-4' : ''}`}>{label}</FormLabel>
        <Select onValueChange={field.onChange} value={field.value as string}>
          <FormControl>
            <SelectTrigger className="w-[100px] h-7">
              <SelectValue />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormItem>
    )}
  />
);

// Main checklist number derived from the `q<N>_` name prefix (e.g. q13_a -> 13).
const getNumericPrefix = (name: string): number | null => {
    const match = name.match(/^q(\d+)_/);
    return match ? parseInt(match[1], 10) : null;
};

export function AdvocateChecklistTab() {
  const form = useFormContext<DraftoProject>();

  return (
    <div className="space-y-2">
      {/* Attestation the advocate must tick before filing. Shown in a soft
          (muted) magenta so it stands out without being harsh. */}
      <FormField
        control={form.control}
        name="checklist.declarationVerified"
        render={({ field }) => (
          <FormItem className="flex items-start gap-2 rounded-md border border-fuchsia-300 dark:border-fuchsia-800/60 bg-fuchsia-50 dark:bg-fuchsia-950/30 p-3 space-y-0">
            <FormControl>
              <Checkbox checked={!!field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            </FormControl>
            <FormLabel className="text-xs font-normal leading-relaxed text-fuchsia-800 dark:text-fuchsia-300 cursor-pointer">
              <span className="font-semibold">Declaration: </span>
              {CHECKLIST_DECLARATION}
            </FormLabel>
          </FormItem>
        )}
      />

      <div className="space-y-1 rounded-md border p-2">
        {checklistQueries.map((item, index) => {
            const currentPrefix = getNumericPrefix(item.name);
            const prevPrefix = index > 0 ? getNumericPrefix(checklistQueries[index - 1].name) : null;
            const showNumber = currentPrefix !== null && currentPrefix !== prevPrefix;
            return (
                <div key={item.name} className="flex items-start">
                    {showNumber && <span className="w-8 pt-2 text-xs font-medium">{currentPrefix}.</span>}
                    <div className="flex-grow">
                        {item.header ? (
                            <div className="py-1 border-b text-xs font-normal">{item.label}</div>
                        ) : (
                            <ChecklistItem name={item.name as ChecklistKey} label={item.label} options={item.options} sub={item.sub} />
                        )}
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
}

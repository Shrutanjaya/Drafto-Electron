
"use client";

import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
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
import type { DraftoProject } from "@/lib/schema";
import { checklistQueries } from "@/lib/checklist-queries";

type ChecklistKey = keyof DraftoProject['checklist'];
type ChecklistValue = "Yes" | "No" | "NA";

interface ChecklistItemProps {
  name: ChecklistKey;
  label: string;
  options: ChecklistValue[];
}

const ChecklistItem = ({ name, label, options, sub }: Omit<ChecklistItemProps, 'name'> & { name: ChecklistKey, sub?: boolean }) => (
  <FormField
    name={`checklist.${name}`}
    render={({ field }) => (
      <FormItem className="flex items-center justify-between space-x-2 py-1 border-b">
        <FormLabel className={`text-xs font-normal ${sub ? 'pl-4' : ''}`}>{label}</FormLabel>
        <Select onValueChange={field.onChange} value={field.value}>
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

const getNumericPrefix = (label: string) => {
    const match = label.match(/^(q)(\d+)_/);
    if (match && match[2]) {
        return parseInt(match[2], 10);
    }
    const oldMatch = label.match(/^(\d+)\. |^\((\d+)\)/);
    return oldMatch ? (oldMatch[1] || oldMatch[2]) : null;
}

export function AdvocateChecklistTab() {
  const form = useFormContext<DraftoProject>();
  const standardIas = useWatch({ control: form.control, name: "standardIas" });

  const caseType = useWatch({ control: form.control, name: "caseType" });
  const q16_pleadings = useWatch({ control: form.control, name: "checklist.q16_pleadings" });
  const q18_surrender = useWatch({ control: form.control, name: "checklist.q18_surrender" });
  
  useEffect(() => {
    if (!standardIas) return; // Guard clause
    // Rule 6
    const hasExemptionIA = standardIas.exemptionOfficialTranslation.active;
    const newValue = hasExemptionIA ? "Yes" : "NA";
    if (form.getValues("checklist.q6_vernacular") !== newValue) {
      form.setValue("checklist.q6_vernacular", newValue);
    }
    
    // Rule 14
    const hasDelayIA = standardIas.condonationOfDelay.active;
    const newDelayValue = hasDelayIA ? "Yes" : "NA";
    if (form.getValues("checklist.q14_delay") !== newDelayValue) {
        form.setValue("checklist.q14_delay", newDelayValue);
    }
    
    // Rule 16(i)
    const hasAdditionalDocsIA = standardIas.additionalDocuments;
    const newPleadingsValue = hasAdditionalDocsIA ? "No" : "Yes";
    if (form.getValues("checklist.q16_pleadings") !== newPleadingsValue) {
        form.setValue("checklist.q16_pleadings", newPleadingsValue);
    }
    
  }, [standardIas, form]);

  useEffect(() => {
    if (!standardIas) return; // Guard clause
    // Rule 16(ii)
    const newValue = q16_pleadings === "No" ? "Yes" : "NA";
    if (form.getValues("checklist.q16_additionalDocs") !== newValue) {
      form.setValue("checklist.q16_additionalDocs", newValue);
    }
  }, [q16_pleadings, form, standardIas]);

  useEffect(() => {
      // Rule 18(i)
      const newValue = caseType === 'Criminal' ? "Yes" : "NA";
      if (form.getValues("checklist.q18_surrender") !== newValue) {
        form.setValue("checklist.q18_surrender", newValue);
      }
  }, [caseType, form]);

  useEffect(() => {
      // Rule 18(ii)
      const newValue = q18_surrender === "No" ? "Yes" : "NA";
      if (form.getValues("checklist.q18_exemption") !== newValue) {
        form.setValue("checklist.q18_exemption", newValue);
      }
  }, [q18_surrender, form]);


  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">
        Advocate's Checklist
      </h2>
      <div className="space-y-1 rounded-md border p-2">
        {checklistQueries.map((item, index) => {
            const currentPrefix = getNumericPrefix(item.name);
            const prevPrefix = index > 0 ? getNumericPrefix(checklistQueries[index-1].name) : null;
            const showNumber = currentPrefix && currentPrefix !== prevPrefix;
            return (
                <div key={item.name} className="flex items-start">
                    {showNumber && <span className="w-8 pt-2 text-xs font-medium">{currentPrefix}.</span>}
                    <div className="flex-grow">
                        <ChecklistItem {...item} />
                    </div>
                </div>
            )
        })}
      </div>
    </div>
  );
}

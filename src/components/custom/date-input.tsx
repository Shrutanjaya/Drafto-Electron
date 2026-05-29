
"use client";

import { useState } from "react";
import { format, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateInputProps {
  value: Date;
  onChange: (date?: Date) => void;
  disabled?: boolean;
}

export function DateInput({ value, onChange, disabled }: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleDateSelect = (date?: Date) => {
    onChange(date);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-[150px] justify-start text-left font-normal h-7 px-2 text-xs",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value && isValid(value) ? format(value, "dd.MM.yyyy") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}


"use client";

import { useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Button } from "../ui/button";
import { ChevronDown, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DraftoProject } from "@/lib/schema";
import { FormControl, FormField, FormItem } from "../ui/form";
import { Input } from "../ui/input";
import { IaGroundTable } from "./ia-ground-table";
import { AamTable } from "./aam-table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../ui/alert-dialog";

interface CustomIaCardProps {
  index: number;
  onRemove: () => void;
  // Field-array base path. Defaults to the SLP custom IAs; WP custom CMs pass
  // `wp.customCms.${index}`.
  basePath?: string;
}

export function CustomIaCard({ index, onRemove, basePath }: CustomIaCardProps) {
  const form = useFormContext<DraftoProject>();
  const [isOpen, setIsOpen] = useState(true);
  const base = basePath ?? `customIas.${index}`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <Card>
        <CardHeader className="p-1 flex-row items-center justify-between bg-muted/50">
          <div className="flex items-center space-x-2 flex-grow">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <FormField
              control={form.control}
              name={`${base}.title` as any}
              render={({ field }) => (
                <FormItem className="flex-grow">
                  <FormControl>
                    <Input {...field} className="text-xs font-medium border-0 bg-transparent focus-visible:ring-0" />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                    <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete this custom application.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onRemove}>Continue</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-1 pt-0 space-y-1">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Grounds</h4>
              <IaGroundTable name={`${base}.grounds` as any} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prayers</h4>
              <AamTable name={`${base}.prayers` as any} />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

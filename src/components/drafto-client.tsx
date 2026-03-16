
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/header";
import { Workspace } from "@/components/workspace";
import { useUndoRedo } from "@/hooks/useUndoRedo";

export function DraftoClient() {
  const form = useForm<DraftoProject>({
    resolver: zodResolver(draftoProjectSchema),
    defaultValues: draftoProjectSchema.parse({}),
    // mode: 'onChange' // This can be performance intensive
  });

  const { undo, redo, canUndo, canRedo } = useUndoRedo(form);

  return (
    <FormProvider {...form}>
      <Card className="border-2 shadow-xl">
        <Header undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
        <main>
          <Workspace />
        </main>
      </Card>
    </FormProvider>
  );
}

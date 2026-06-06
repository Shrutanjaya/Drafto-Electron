
"use client";

import { useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { draftoProjectSchema, type DraftoProject } from "@/lib/schema";
import { newBlankProject } from "@/lib/project-defaults";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/header";
import { Workspace } from "@/components/workspace";
import { FindReplaceBar } from "@/components/custom/find-replace-bar";
import { AiChatPanel } from "@/components/custom/ai-chat-panel";
import { FieldRevealProvider } from "@/components/custom/field-reveal-provider";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useToast } from "@/hooks/use-toast";

export function DraftoClient() {
  const form = useForm<DraftoProject>({
    resolver: zodResolver(draftoProjectSchema),
    defaultValues: newBlankProject(),
    // mode: 'onChange' // This can be performance intensive
  });

  const { undo, redo, canUndo, canRedo } = useUndoRedo(form);
  const { toast } = useToast();

  // Listen for background OCR dependency setup
  useEffect(() => {
    if (!window.electron) return;
    let toastShown = false;
    window.electron.onPythonDepsLog((msg) => {
      if (!toastShown) {
        toastShown = true;
        toast({ title: "Setting up OCR engine…", description: msg, duration: 8000 });
      }
    });
    window.electron.onPythonDepsReady((ready) => {
      if (ready) {
        toast({ title: "OCR engine ready", description: "All dependencies installed successfully.", duration: 4000 });
      }
    });
  }, [toast]);

  return (
    <FormProvider {...form}>
      <FieldRevealProvider>
        <Card className="border-2 shadow-xl">
          <Header undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
          <main>
            <Workspace />
          </main>
        </Card>
        <FindReplaceBar />
        <AiChatPanel />
      </FieldRevealProvider>
    </FormProvider>
  );
}

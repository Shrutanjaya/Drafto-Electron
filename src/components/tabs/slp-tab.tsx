
"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { DraftoProject } from "@/lib/schema";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoDTable } from "@/components/custom/lod-table";
import { AamTable } from "@/components/custom/aam-table";
import { AppendixDialog } from "@/components/dialogs/appendix-dialog";
import { DeclarationsDialog } from "@/components/dialogs/declarations-dialog";
import { InterimReliefDialog } from "@/components/dialogs/interim-relief-dialog";
import { QuestionsOfLawDialog } from "@/components/dialogs/questions-of-law-dialog";
import { EditorToolbar } from "../custom/editor-toolbar";
import { EditorProvider } from "@/components/custom/editor-provider";
import { BadhiyaBox } from "../custom/badhiya-box";
import { FormControl, FormField, FormItem } from "../ui/form";
import { AffidavitDialog } from "../dialogs/affidavit-dialog";
import { VakalatnamaDialog } from "../dialogs/vakalatnama-dialog";


export function SlpTab() {
  const form = useFormContext<DraftoProject>();

  return (
    <EditorProvider>
      <div className="flex flex-col h-[calc(100vh-160px)]">
        <div className="flex items-center gap-1 mb-1">
          <QuestionsOfLawDialog />
          <InterimReliefDialog />
          <DeclarationsDialog />
          <AppendixDialog />
          <div className="flex-grow"></div>
          <EditorToolbar />
        </div>

        <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="slp-tab-panels">
          <ResizablePanel defaultSize={50}>
            <div className="flex flex-col h-full p-1">
              <h3 className="font-headline text-sm font-bold text-primary mb-1">Facts</h3>
              <div className="flex-grow overflow-auto">
                <LoDTable />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30}>
            <div className="flex flex-col h-full p-1">
              <h3 className="font-headline text-sm font-bold text-primary mb-1">Grounds</h3>
              <div className="flex-grow overflow-auto">
                <AamTable name="grounds" defaultRows={10} />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20}>
            <div className="flex flex-col h-full p-1">
              <h3 className="font-headline text-sm font-bold text-primary mb-1">Synopsis</h3>
              <FormField
                control={form.control}
                name="synopsis"
                render={({ field }) => (
                  <FormItem className="flex-grow flex flex-col overflow-y-auto">
                    <FormControl>
                      <BadhiyaBox
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </EditorProvider>
  );
}

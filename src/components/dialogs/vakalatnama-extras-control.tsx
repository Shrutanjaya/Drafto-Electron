"use client";

import React from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Paperclip } from "lucide-react";
import type { DraftoProject } from "@/lib/schema";

const fileNameOf = (entry: any): string | undefined =>
  entry?.file?.name ||
  (entry?.filePath ? String(entry.filePath).split(/[\\/]/).pop() : undefined);

interface VakalatnamaExtrasControlProps {
  /** Optional custom file picker (e.g. Electron dialog + fallback). Defaults to browser file input. */
  pickFile?: () => Promise<File | null>;
  /** Hide the separate PDF attachment chips (e.g. if the caller only needs Index flags). */
  hideSeparateUploads?: boolean;
}

export function VakalatnamaExtrasControl({
  pickFile,
  hideSeparateUploads = false,
}: VakalatnamaExtrasControlProps) {
  const form = useFormContext<DraftoProject>();
  const withBoard = !!useWatch({ control: form.control, name: "vakalatnamaWithBoardResolution" as any });
  const withAuth = !!useWatch({ control: form.control, name: "vakalatnamaWithAuthorityLetter" as any });
  const boardEntry = useWatch({ control: form.control, name: "vakalatnamaBoardResolution" as any });
  const authEntry = useWatch({ control: form.control, name: "vakalatnamaAuthorityLetter" as any });

  const defaultPick = (): Promise<File | null> =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,image/*";
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });

  const handleAttach = async (fieldPath: "vakalatnamaBoardResolution" | "vakalatnamaAuthorityLetter") => {
    const f = await (pickFile ? pickFile() : defaultPick());
    if (f) {
      form.setValue(`${fieldPath}.file` as any, f, { shouldDirty: true });
      form.setValue(`${fieldPath}.filePath` as any, (f as any).path, { shouldDirty: true });
    }
  };

  const handleClear = (fieldPath: "vakalatnamaBoardResolution" | "vakalatnamaAuthorityLetter") => {
    form.setValue(`${fieldPath}.file` as any, undefined, { shouldDirty: true });
    form.setValue(`${fieldPath}.filePath` as any, undefined, { shouldDirty: true });
  };

  const boardName = fileNameOf(boardEntry);
  const authName = fileNameOf(authEntry);

  return (
    <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-foreground">
          <Checkbox
            checked={withBoard}
            onCheckedChange={(v) => form.setValue("vakalatnamaWithBoardResolution" as any, !!v, { shouldDirty: true })}
            className="h-3.5 w-3.5"
          />
          <span>+ Board Resolution</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none hover:text-foreground">
          <Checkbox
            checked={withAuth}
            onCheckedChange={(v) => form.setValue("vakalatnamaWithAuthorityLetter" as any, !!v, { shouldDirty: true })}
            className="h-3.5 w-3.5"
          />
          <span>+ Authority Letter</span>
        </label>
      </div>

      {!hideSeparateUploads && (withBoard || withAuth) && (
        <div className="flex flex-wrap items-center gap-2 pl-0.5 pt-0.5">
          {withBoard && (
            <div className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">
              <Paperclip className="h-2.5 w-2.5 shrink-0 text-primary/70" />
              <span className="font-medium text-foreground/80">Board Res.:</span>
              {boardName ? (
                <>
                  <span className="max-w-[130px] truncate text-foreground">{boardName}</span>
                  <button type="button" onClick={() => handleClear("vakalatnamaBoardResolution")} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Remove">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => handleAttach("vakalatnamaBoardResolution")} className="text-primary hover:underline cursor-pointer">
                  Attach separate PDF (optional)
                </button>
              )}
            </div>
          )}
          {withAuth && (
            <div className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">
              <Paperclip className="h-2.5 w-2.5 shrink-0 text-primary/70" />
              <span className="font-medium text-foreground/80">Authority Letter:</span>
              {authName ? (
                <>
                  <span className="max-w-[130px] truncate text-foreground">{authName}</span>
                  <button type="button" onClick={() => handleClear("vakalatnamaAuthorityLetter")} className="text-muted-foreground hover:text-destructive cursor-pointer" title="Remove">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => handleAttach("vakalatnamaAuthorityLetter")} className="text-primary hover:underline cursor-pointer">
                  Attach separate PDF (optional)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

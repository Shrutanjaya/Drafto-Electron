"use client";

import React, { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { DraftoProject } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Sparkles, ListPlus } from "lucide-react";
import { LoDTable } from "@/components/custom/lod-table";
import { cn } from "@/lib/utils";
import {
  annexureModeOf,
  annexureModePath as getAnnexureModePath,
  factsRowsOf,
  factsRowsPath as getFactsRowsPath,
  legacyFactsPath as getLegacyFactsPath,
  factsRowsFromLod,
  appendNewLodRowsToFactsRows,
  convertFactsHtmlToRows,
} from "@/lib/wp/facts-mode";

interface FactsSectionProps {
  factsPath?: string;
  annexureModePath?: string;
  storedFactsPath?: string;
  headerExtra?: React.ReactNode;
  subtitle?: string;
  className?: string;
}

export function FactsSection({
  factsPath: customFactsPath,
  annexureModePath: customAnnexureModePath,
  storedFactsPath: customStoredFactsPath,
  headerExtra,
  subtitle,
  className,
}: FactsSectionProps) {
  const form = useFormContext<DraftoProject>();
  const courtType = useWatch({ control: form.control, name: "courtType" });

  const factsPath = customFactsPath || getFactsRowsPath(courtType);
  const annexureModePath = customAnnexureModePath || getAnnexureModePath(courtType);
  const storedFactsPath = customStoredFactsPath || getLegacyFactsPath(courtType);

  const annexureMode = useWatch({ control: form.control, name: annexureModePath as any }) || "lod";
  const lod = useWatch({ control: form.control, name: "listOfDates" }) || [];
  const factsRows = useWatch({ control: form.control, name: factsPath as any }) || [];
  const [tableRevision, setTableRevision] = React.useState(0);

  // Auto-migrate legacy monolithic facts HTML to factsRows on load if factsRows is empty
  useEffect(() => {
    const currentRows = form.getValues(factsPath as any) || [];
    const storedHtml = form.getValues(storedFactsPath as any) || "";
    if (currentRows.length === 0 && typeof storedHtml === "string" && storedHtml.trim()) {
      const converted = convertFactsHtmlToRows(storedHtml);
      if (converted.length > 0) {
        form.setValue(factsPath as any, converted as any, { shouldDirty: false });
      }
    }
  }, [form, factsPath, storedFactsPath]);

  // Compute how many new LoD rows exist that are not yet in factsRows (drives "Append new rows")
  const newLodRowCount = useMemo(() => {
    const existingIds = new Set((factsRows as any[]).map((r) => r?.id));
    return lod.filter(
      (l: any) =>
        (String(l?.date ?? "").trim() || String(l?.event ?? "").trim() || (l?.annexures || []).length > 0) &&
        !existingIds.has(l?.id)
    ).length;
  }, [lod, factsRows]);

  const handleAnnexureModeChange = (newMode: "lod" | "facts") => {
    if (newMode === annexureMode) return;
    const proj = form.getValues();
    form.setValue(annexureModePath as any, newMode, { shouldDirty: true });

    // When switching to 'facts', carry annexures across to facts rows if facts has none
    if (newMode === "facts") {
      const currentFacts = factsRowsOf(proj);
      const factsHasAnnexures = currentFacts.some((r: any) => (r.annexures || []).length > 0);
      const currentLod = proj.listOfDates || [];
      const lodHasAnnexures = currentLod.some((r: any) => (r.annexures || []).length > 0);
      if (!factsHasAnnexures && lodHasAnnexures) {
        const lodMap = new Map(currentLod.map((l: any) => [l.id, l]));
        const updatedFacts = currentFacts.map((r: any) => {
          const matchingLod = lodMap.get(r.id);
          if (matchingLod && (matchingLod.annexures || []).length > 0) {
            return { ...r, annexures: [...matchingLod.annexures] };
          }
          return r;
        });
        form.setValue(factsPath as any, updatedFacts as any, { shouldDirty: true });
      }
    }
  };

  const handlePopulateFromLod = () => {
    const proj = form.getValues();
    const currentRows = form.getValues(factsPath as any) || [];
    const hasExistingText = currentRows.some((r: any) => (r.event || "").trim());
    if (hasExistingText) {
      if (
        !window.confirm(
          "Replace the Facts table with a fresh transposition from the List of Dates? Any edits made to Facts rows will be overwritten."
        )
      ) {
        return;
      }
    }
    const newRows = factsRowsFromLod(proj, currentRows);
    form.setValue(factsPath as any, newRows as any, { shouldDirty: true });
    setTableRevision((v) => v + 1);
  };

  const handleAppendNewRows = () => {
    const proj = form.getValues();
    const currentRows = form.getValues(factsPath as any) || [];
    const updated = appendNewLodRowsToFactsRows(proj, currentRows);
    form.setValue(factsPath as any, updated as any, { shouldDirty: true });
    setTableRevision((v) => v + 1);
  };

  return (
    <div className={cn("flex h-full flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Mark Annexures in:</span>
            <div className="inline-flex rounded-md border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => handleAnnexureModeChange("lod")}
                className={cn(
                  "px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer",
                  annexureMode === "lod"
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                List of Dates
              </button>
              <button
                type="button"
                onClick={() => handleAnnexureModeChange("facts")}
                className={cn(
                  "px-2.5 py-0.5 rounded text-xs transition-colors cursor-pointer",
                  annexureMode === "facts"
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Facts
              </button>
            </div>
          </div>
          {headerExtra}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {newLodRowCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Add rows for List-of-Dates entries added after the last populate, without touching your existing rows"
              onClick={handleAppendNewRows}
            >
              <ListPlus className="mr-1 h-3.5 w-3.5" />
              Append {newLodRowCount} new row{newLodRowCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            title="Populate the Facts table from the List of Dates"
            onClick={handlePopulateFromLod}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Populate from List of Dates
          </Button>
        </div>
      </div>

      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

      <div className="flex-grow overflow-auto">
        <LoDTable key={`${factsPath}-${tableRevision}`} name={factsPath} hideDate hideAnnexures={annexureMode === "lod"} allowHeadings={true} />
      </div>
    </div>
  );
}

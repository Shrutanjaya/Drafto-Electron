"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GitFork,
  CheckCircle2,
  AlertTriangle,
  Info,
  Scale,
  Landmark,
  Building2,
  Calendar,
  FileText,
  Users,
} from "lucide-react";
import {
  type ProjectCourtType,
  getDocumentTypeOption,
  getDifferentCourtDocumentTypes,
  getForumForCourtType,
} from "@/lib/court-family";
import type { DraftoProject } from "@/lib/schema";
import { cn } from "@/lib/utils";

interface ForkProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProject: DraftoProject;
  onFork: (targetType: ProjectCourtType) => void;
}

export function ForkProjectDialog({
  open,
  onOpenChange,
  currentProject,
  onFork,
}: ForkProjectDialogProps) {
  const currentCt = currentProject.courtType ?? "SLP";
  const currentOption = getDocumentTypeOption(currentCt);
  const eligibleTargets = getDifferentCourtDocumentTypes(currentCt);

  const [selectedTarget, setSelectedTarget] = useState<ProjectCourtType | null>(() =>
    eligibleTargets.length > 0 ? eligibleTargets[0].type : null
  );

  React.useEffect(() => {
    if (eligibleTargets.length > 0 && (!selectedTarget || !eligibleTargets.some((t) => t.type === selectedTarget))) {
      setSelectedTarget(eligibleTargets[0].type);
    }
  }, [currentCt, eligibleTargets, selectedTarget]);

  const targetOption = selectedTarget ? getDocumentTypeOption(selectedTarget) : null;
  const sourceForum = getForumForCourtType(currentCt);
  const targetForum = selectedTarget ? getForumForCourtType(selectedTarget) : null;

  const SourceForumIcon = sourceForum === "DHC" ? Landmark : sourceForum === "CAT" ? Building2 : Scale;

  const datesCount = (currentProject.listOfDates || []).filter(
    (d) => d.date?.trim() || d.event?.trim() || (d.annexures && d.annexures.length > 0)
  ).length;
  const annexCount = (currentProject.listOfDates || []).reduce(
    (acc, d) => acc + (d.annexures?.length || 0),
    0
  );
  const collyCount = (currentProject.listOfDates || []).reduce(
    (acc, d) => acc + (d.annexures?.filter((a) => a.isColly)?.length || 0),
    0
  );
  const partiesCount =
    (currentProject.petitioners?.filter((p) => p.name?.trim()).length || 0) +
    (currentProject.respondents?.filter((r) => r.name?.trim()).length || 0);

  const handleConfirm = () => {
    if (!selectedTarget) return;
    onFork(selectedTarget);
    onOpenChange(false);
  };

  // Group targets by forum
  const forumGroups = React.useMemo(() => {
    const groups: { forumName: string; forumId: string; options: typeof eligibleTargets }[] = [];
    for (const opt of eligibleTargets) {
      let g = groups.find((grp) => grp.forumId === opt.forumId);
      if (!g) {
        g = { forumName: opt.forumName, forumId: opt.forumId, options: [] };
        groups.push(g);
      }
      g.options.push(opt);
    }
    return groups;
  }, [eligibleTargets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Fork to New Draft (Different Court)</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Graduates or transfers this matter to another court without touching or modifying your current draft file.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          {/* Current Source Info Card */}
          <div className="rounded-lg border bg-muted/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SourceForumIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">{currentOption.forumName}</span>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-bold text-muted-foreground">
                Source Matter
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-foreground">{currentOption.label}</span>
              <span className="text-xs text-muted-foreground font-mono">.{currentOption.extension}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-primary" /> {datesCount} Dates/Events
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-primary" /> {annexCount} Annexures
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-primary" /> {partiesCount} Parties
              </span>
            </div>
          </div>

          {/* Target Court Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Target Court & Document Type:
            </label>
            <div className="space-y-3">
              {forumGroups.map((group) => (
                <div key={group.forumId} className="space-y-1.5">
                  <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 px-0.5">
                    {group.forumId === "SC" ? <Scale className="h-3.5 w-3.5 text-indigo-500" /> : group.forumId === "DHC" ? <Landmark className="h-3.5 w-3.5 text-teal-500" /> : <Building2 className="h-3.5 w-3.5 text-amber-500" />}
                    <span>{group.forumName}</span>
                  </div>
                  <div className="grid gap-1.5">
                    {group.options.map((target) => {
                      const isSelected = selectedTarget === target.type;
                      return (
                        <div
                          key={target.type}
                          onClick={() => setSelectedTarget(target.type)}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-all hover:bg-accent/40",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/50"
                              : "border-border hover:border-muted-foreground/40"
                          )}
                        >
                          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                            {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">{target.label}</span>
                              <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                                {target.badge}
                              </Badge>
                              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                                .{target.extension}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                              {target.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guarantees & Migration Summary */}
          {selectedTarget && targetOption && (
            <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span>What happens when you fork:</span>
              </div>
              <ul className="space-y-1 text-muted-foreground pl-5 list-disc">
                <li>Your current draft file on disk remains <strong>completely safe and untouched</strong>.</li>
                <li>A brand new, unsaved draft for the <strong>{targetOption.forumName}</strong> will open.</li>
                <li>All <strong>List of Dates</strong>, attached PDF files, and <strong>Parties</strong> will be transferred.</li>
                <li>Court-specific prayers, front matter, and local applications will be freshly initialized for the target court.</li>
              </ul>

              {sourceForum === "DHC" && (targetForum === "SC" || targetForum === "CAT") && collyCount > 0 && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 p-2 text-blue-900 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50 mt-2">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <span>
                    <strong>Supreme Court Compliance:</strong> {collyCount} Colly annexure(s) from your Delhi High Court draft will be automatically unbundled into separate individual numbered annexures to strictly satisfy Supreme Court Registry Practice.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 shrink-0 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedTarget}
            className="gap-1.5 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <GitFork className="h-3.5 w-3.5" />
            Fork to {targetOption?.label || "Selected Court"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

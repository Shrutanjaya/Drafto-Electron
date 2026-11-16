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
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Scale,
  Landmark,
  Building2,
} from "lucide-react";
import {
  type ProjectCourtType,
  getDocumentTypeOption,
  getSameCourtDocumentTypes,
  getForumForCourtType,
  isScWpFamily,
  isSlpFamily,
} from "@/lib/court-family";
import { cn } from "@/lib/utils";

interface ConvertProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCourtType?: ProjectCourtType;
  onConvert: (targetType: ProjectCourtType) => void;
}

export function ConvertProjectDialog({
  open,
  onOpenChange,
  currentCourtType = "SLP",
  onConvert,
}: ConvertProjectDialogProps) {
  const currentOption = getDocumentTypeOption(currentCourtType);
  const eligibleTargets = getSameCourtDocumentTypes(currentCourtType);
  
  const [selectedTarget, setSelectedTarget] = useState<ProjectCourtType | null>(() =>
    eligibleTargets.length > 0 ? eligibleTargets[0].type : null
  );

  // Sync default selection if current courtType changes
  React.useEffect(() => {
    if (eligibleTargets.length > 0 && (!selectedTarget || !eligibleTargets.some(t => t.type === selectedTarget))) {
      setSelectedTarget(eligibleTargets[0].type);
    }
  }, [currentCourtType, eligibleTargets, selectedTarget]);

  const targetOption = selectedTarget ? getDocumentTypeOption(selectedTarget) : null;
  const forum = getForumForCourtType(currentCourtType);

  const ForumIcon = forum === "DHC" ? Landmark : forum === "CAT" ? Building2 : Scale;

  const handleConfirm = () => {
    if (!selectedTarget) return;
    onConvert(selectedTarget);
    onOpenChange(false);
  };

  const getTransitionNotice = (from: ProjectCourtType, to: ProjectCourtType) => {
    if (from === "WritPetitionPIL" && to === "WritPetitionSC") {
      return {
        type: "info" as const,
        text: "PIL disclosures (averments regarding public injury, Aadhaar/PAN/CIN entries) will be safely preserved in your project, but omitted from the generated Writ Petition body.",
      };
    }
    if (from === "WritPetitionSC" && to === "WritPetitionPIL") {
      return {
        type: "info" as const,
        text: "The project will be upgraded to PIL format. You will now be able to add the mandatory public injury averments and party disclosure details.",
      };
    }
    if (isSlpFamily(from) && to === "Appeal") {
      return {
        type: "info" as const,
        text: "Annexures will automatically be labelled with the 'A-' series (Annexure A-1, A-2) as required by Supreme Court practice for statutory appeals. You can specify the statutory appeal provision in Preliminary → Impugned Orders.",
      };
    }
    if (from === "Appeal" && to === "SLP") {
      return {
        type: "info" as const,
        text: "Annexures will automatically revert to the 'P-' series (Annexure P-1, P-2) for Special Leave Petitions.",
      };
    }
    if (isSlpFamily(from) && isScWpFamily(to)) {
      return {
        type: "warning" as const,
        text: "The document structure will transition to the Supreme Court Article 32 workspace (.scwp). Your synopsis will initialize the Facts section, and all dates, annexures, grounds, and parties are retained. You will be prompted to save as a new .scwp project.",
      };
    }
    if (isScWpFamily(from) && isSlpFamily(to)) {
      return {
        type: "warning" as const,
        text: "The document structure will transition to the SLP workspace (.drafto). Your facts will initialize the Synopsis, and all dates, annexures, grounds, and parties are retained. You will be prompted to save as a new .drafto project.",
      };
    }
    return null;
  };

  const notice = selectedTarget ? getTransitionNotice(currentCourtType, selectedTarget) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Convert Document Type</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Convert this project to another document type of the same court without losing your entered work.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current Document Summary */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ForumIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{currentOption.forumName}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-semibold">
                Current Type
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-bold text-foreground">{currentOption.label}</span>
              <span className="text-xs text-muted-foreground">({currentOption.badge})</span>
            </div>
          </div>

          {/* Target Selection */}
          {eligibleTargets.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Info className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No other document types available for this court</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Drafto currently supports one document type for {currentOption.forumName}. Conversion across different courts is not permitted to preserve jurisdictional accuracy.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Convert To Document Type:
              </label>
              <div className="grid gap-2">
                {eligibleTargets.map((target) => {
                  const isSelected = selectedTarget === target.type;
                  return (
                    <div
                      key={target.type}
                      onClick={() => setSelectedTarget(target.type)}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all hover:bg-accent/40",
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
                          <span className="text-sm font-semibold text-foreground">{target.label}</span>
                          <Badge variant="outline" className="text-[10px] py-0">
                            {target.badge}
                          </Badge>
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                            .{target.extension}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                          {target.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preservation & Transition Guarantees */}
          {eligibleTargets.length > 0 && selectedTarget && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Everything you have entered is preserved:</span>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>List of Dates & Events</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>All Annexures & Attached PDFs</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>Petitioners & Respondents</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>Grounds & Questions of Law</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>Advocate-on-Record Details</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span>Listing Proforma & Checklist</span>
                </li>
              </ul>

              {notice && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md p-2.5 text-xs leading-relaxed mt-2",
                    notice.type === "warning"
                      ? "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/50"
                      : "bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900/50"
                  )}
                >
                  {notice.type === "warning" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  )}
                  <span>{notice.text}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {eligibleTargets.length > 0 && (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!selectedTarget}
              className="gap-1.5 font-semibold"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Convert to {targetOption?.label || "Selected"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

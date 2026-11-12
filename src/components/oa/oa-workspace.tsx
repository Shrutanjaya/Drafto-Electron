"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useStickyState } from "@/hooks/useStickyState";
import { Columns2, Columns3, Maximize2, Minimize2, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import { VaadiTable } from "@/components/custom/vaadi-table";
import { AamTable } from "@/components/custom/aam-table";
import { BadhiyaBox } from "@/components/custom/badhiya-box";
import { LoDTable } from "@/components/custom/lod-table";
import { EditorProvider } from "@/components/custom/editor-provider";
import { EditorToolbar } from "@/components/custom/editor-toolbar";
import { SectionDialog } from "@/components/custom/section-dialog";
import { OaApplications } from "@/components/oa/oa-applications";
import type { DraftoProject } from "@/lib/schema";
import { getSettings } from "@/components/dialogs/settings-dialog";
import { FactsSection } from "@/components/custom/facts-section";
import { oaBench } from "@/lib/oa/oa-benches";
import { oaMaSchema } from "@/lib/schema";
import { MayurButton } from "@/components/custom/mayur-button";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";
import { DateInput } from "@/components/custom/date-input";
import { getOaFiledBy } from "@/lib/oa/oa-settings";

const OA_RESIDUARY = "Pass such other/further orders as this Hon’ble Tribunal may deem fit and proper in the facts and circumstances of the case.";

// The line under the name means different things on the two sides: an
// Applicant describes their post, a Respondent is served through an officer.
const APPLICANT_THROUGH_PLACEHOLDER = 'E.g., working as Senior Accounts Officer (Group-A)';
const RESPONDENT_THROUGH_PLACEHOLDER = 'E.g., "Through the Secretary, Ministry of Home Affairs"';
const PANEL_H = "h-[calc(100vh-170px)]";

type OaSection = "synopsis" | "listOfDates" | "reliefs" | "facts" | "grounds" | "jurisdiction" | "interim" | "other";

// Sub-paragraph styles for a numbered parent para — the decimal option is
// labelled with that para's own number (4.1 for Facts, 5.1 for Grounds).
const subparaStyles = (parentNum: number) => [
  { value: "decimal-sub", label: `${parentNum}.1, ${parentNum}.2` },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "upper-alpha", label: "A, B, C" },
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-roman", label: "I, II, III" },
];
const SUBPARA_STYLES_PRAYER = [
  { value: "lower-roman", label: "i, ii, iii" },
  { value: "upper-roman", label: "I, II, III" },
  { value: "lower-alpha", label: "a, b, c" },
  { value: "upper-alpha", label: "A, B, C" },
];

// ── Header for modular pane in Original Application ────────────────────────
function OaPaneHeader({
  paneIndex,
  section,
  onSelectSection,
  sections,
  isMaximized,
  onToggleMaximize,
}: {
  paneIndex: number;
  section: OaSection;
  onSelectSection: (section: OaSection) => void;
  sections: { id: OaSection; label: string; active: boolean }[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
}) {
  const current = sections.find((s) => s.id === section);
  const mayurSecMap: Partial<Record<OaSection, string>> = {
    synopsis: "synopsis",
    listOfDates: "lod",
    reliefs: "reliefs",
    facts: "facts",
    grounds: "grounds",
    interim: "interim",
    jurisdiction: "oa-jurisdiction",
  };

  return (
    <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-border/50 shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <Select value={section} onValueChange={(v) => onSelectSection(v as OaSection)}>
          <SelectTrigger className="h-7 text-xs font-semibold px-2 py-0 border-0 bg-transparent hover:bg-muted/60 shadow-none gap-1.5 focus:ring-0 w-auto cursor-pointer">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className={cn(
                  "h-2 w-2 rounded-full flex-shrink-0 transition-colors",
                  current?.active ? "bg-green-500" : "bg-muted-foreground/30"
                )}
              />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent className="text-xs">
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      s.active ? "bg-green-500" : "bg-muted-foreground/30"
                    )}
                  />
                  <span>{s.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {mayurSecMap[section] && <MayurButton section={mayurSecMap[section]!} />}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
          title={isMaximized ? "Restore split view" : "Maximize this pane"}
          onClick={onToggleMaximize}
        >
          {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

function NavRow({ label, active, selected, onClick }: { label: string; active: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ro-nav
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors cursor-pointer",
        selected
          ? "bg-primary text-primary-foreground dark:text-white font-medium"
          : "text-foreground hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 flex-shrink-0 rounded-full transition-colors",
          active
            ? selected
              ? "bg-green-300"
              : "bg-green-500"
            : selected
            ? "bg-primary-foreground/40"
            : "bg-muted-foreground/30"
        )}
      />
      <span className="leading-snug">{label}</span>
    </button>
  );
}

function StylePicker({ name, options }: { name: any; options: { value: string; label: string }[] }) {
  const form = useFormContext<DraftoProject>();
  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sub-para</span>
        <Select onValueChange={field.onChange} value={field.value}>
          <FormControl><SelectTrigger className="h-6 w-[110px] px-2 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </FormItem>
    )} />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

// Central Administrative Tribunal — Original Application interface.
export function OaWorkspace() {
  const form = useFormContext<DraftoProject>();
  const bench = oaBench(getSettings().oaBench);

  // Modular 2-pane / 3-pane state for Original Application (CAT)
  const defaultOaSlots: [OaSection, OaSection, OaSection] = [
    "listOfDates",
    "grounds",
    "synopsis",
  ];

  const [paneCount, setPaneCount] = useStickyState<2 | 3>("oa-tab-pane-count", getSettings().defaultPanes ?? 3);
  const [paneSlots, setPaneSlots] = useStickyState<[OaSection, OaSection, OaSection]>(
    "oa-tab-pane-slots",
    defaultOaSlots
  );
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);
  const [prelimSection, setPrelimSection] = useState<"parties" | "jurisdiction" | "limitation" | "advocate">("parties");

  // Sequences for "View Next" cycling (6 core sections)
  const twoPaneSets: [OaSection, OaSection][] = useMemo(() => [
    ["listOfDates", "synopsis"],
    ["grounds", "facts"],
    ["reliefs", "interim"],
  ], []);

  const threePaneSets: [OaSection, OaSection, OaSection][] = useMemo(() => [
    ["listOfDates", "grounds", "synopsis"],
    ["facts", "reliefs", "interim"],
  ], []);

  const handleTogglePaneCount = () => {
    const nextCount: 2 | 3 = paneCount === 3 ? 2 : 3;
    setPaneCount(nextCount);
    setMaximizedPane(null);
    if (nextCount === 2) {
      const current = [paneSlots[0], paneSlots[1]];
      const match = twoPaneSets.some(([a, b]) => a === current[0] && b === current[1]);
      if (!match) {
        const [s0, s1] = twoPaneSets[0];
        setPaneSlots((prev) => [s0, s1, prev[2]]);
      }
    } else {
      const match = threePaneSets.some(([a, b, c]) => a === paneSlots[0] && b === paneSlots[1] && c === paneSlots[2]);
      if (!match) {
        setPaneSlots(threePaneSets[0]);
      }
    }
  };

  const handleViewNext = () => {
    setMaximizedPane(null);
    if (paneCount === 2) {
      const current = [paneSlots[0], paneSlots[1]];
      const matchIdx = twoPaneSets.findIndex(
        ([a, b]) => a === current[0] && b === current[1]
      );
      const nextIdx = (matchIdx + 1) % twoPaneSets.length;
      const [s0, s1] = twoPaneSets[nextIdx];
      setPaneSlots((prev) => [s0, s1, prev[2]]);
    } else {
      const matchIdx = threePaneSets.findIndex(
        ([a, b, c]) => a === paneSlots[0] && b === paneSlots[1] && c === paneSlots[2]
      );
      const nextIdx = (matchIdx + 1) % threePaneSets.length;
      const [s0, s1, s2] = threePaneSets[nextIdx];
      setPaneSlots([s0, s1, s2]);
    }
  };

  const handleSelectPane = (paneIndex: number, newSection: OaSection) => {
    setPaneSlots((prev) => {
      const next = [...prev] as [OaSection, OaSection, OaSection];
      const maxSlots = paneCount;
      const existingIndex = next.slice(0, maxSlots).findIndex((s, idx) => s === newSection && idx !== paneIndex);
      if (existingIndex !== -1) {
        next[existingIndex] = next[paneIndex];
      }
      next[paneIndex] = newSection;
      return next;
    });
  };

  // Find & Replace navigation: when a match targets an OA section,
  // ensure that section is mounted in an active slot so the field is revealable.
  useEffect(() => {
    const applyPending = () => {
      const p = getPendingReveal();
      if (p && p.tab === "oa" && p.section) {
        const sec = p.section as OaSection;
        setPaneSlots((prev) => {
          if (prev.slice(0, paneCount).includes(sec)) return prev;
          return [sec, prev[1], prev[2]];
        });
        setMaximizedPane(null);
      }
    };
    window.addEventListener(FIND_REVEAL_EVENT, applyPending);
    applyPending();
    return () => window.removeEventListener(FIND_REVEAL_EVENT, applyPending);
  }, [paneCount, setPaneSlots]);

  // Watches for nav-dot activity.
  const synopsis = useWatch({ control: form.control, name: "synopsis" });
  const lod = useWatch({ control: form.control, name: "listOfDates" });
  const reliefs = useWatch({ control: form.control, name: "oa.reliefs" });
  const facts = useWatch({ control: form.control, name: "oa.facts" });
  const factsRowsWatch = useWatch({ control: form.control, name: "oa.factsRows" as any });
  const annexureMode = useWatch({ control: form.control, name: "oa.annexureMode" as any }) || "lod";
  const grounds = useWatch({ control: form.control, name: "grounds" });
  const jurPosted = useWatch({ control: form.control, name: "oa.jurisdictionPosted" });
  const jurCause = useWatch({ control: form.control, name: "oa.jurisdictionCause" });
  const limitation = useWatch({ control: form.control, name: "oa.limitation" });
  const delayDays = useWatch({ control: form.control, name: "oa.delayDays" });
  const interimNil = useWatch({ control: form.control, name: "oa.interimNil" });
  const interimReliefs = useWatch({ control: form.control, name: "oa.interimReliefs" });
  const postalOrders = useWatch({ control: form.control, name: "oa.postalOrders" });
  const oaAdv = useWatch({ control: form.control, name: "oa.advocate" });
  const petitioners = useWatch({ control: form.control, name: "petitioners" });
  const respondents = useWatch({ control: form.control, name: "respondents" });
  const respondentCount = (respondents || []).filter((r: any) => String(r?.name ?? "").trim()).length || (respondents?.length || 1);
  const multiAppl = ((petitioners || []).filter((p: any) => String(p?.name ?? "").trim()).length || (petitioners?.length || 1)) > 1;
  const applNoun = multiAppl ? "Applicants" : "Applicant";
  const applIs = multiAppl ? "are" : "is";
  const applDeclares = multiAppl ? "declare" : "declares";
  const applPossessive = multiAppl ? "Applicants’" : "Applicant’s";
  const resNoun = respondentCount > 1 ? "Respondents" : "Respondent";

  // ── Applications (MAs / PT) ─────────────────────────────────────────────────
  const applicantCount = (petitioners || []).filter((p: any) => String(p?.name ?? "").trim()).length;
  const needsDelay = limitation === "delay" || limitation === "abundantCaution";
  const needsJoinder = applicantCount > 1;
  const needsPt = !jurPosted && !jurCause;

  // Auto-insert / remove the triggered MAs (delay, joinder) and the PT.
  useEffect(() => {
    const cur = form.getValues("oa.mas") || [];
    let next = [...cur];
    const ensure = (kind: string, need: boolean, extra?: Record<string, unknown>) => {
      const has = next.some((m: any) => m.kind === kind);
      if (need && !has) next = [oaMaSchema.parse({ kind, ...(extra ?? {}) }), ...next];
      else if (!need && has) next = next.filter((m: any) => m.kind !== kind);
    };
    ensure("pt", needsPt);
    // "Abundant caution" asserts there is no delay, so its application prays to
    // condone "the delay, if any" — i.e. the without-prejudice variant.
    ensure("delay", needsDelay, { delayWithoutPrejudice: limitation === "abundantCaution" });
    ensure("joinder", needsJoinder);
    const sig = (a: any[]) => a.map((m) => m.kind).join("|") + "#" + a.map((m) => m.id).join(",");
    if (sig(next) !== sig(cur)) form.setValue("oa.mas", next, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDelay, needsJoinder, needsPt, limitation]);

  const hasAam = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.particulars ?? "").trim().length > 0);
  const hasLoD = (rows: any[]) => Array.isArray(rows) && rows.some((r: any) => String(r?.date ?? "").trim().length > 0 || String(r?.event ?? "").trim().length > 0);

  const active: Record<OaSection, boolean> = {
    synopsis: !!String(synopsis ?? "").trim(),
    listOfDates: hasLoD(lod),
    reliefs: hasAam(reliefs),
    facts: (factsRowsWatch || []).length > 0 || !!String(facts ?? "").trim(),
    grounds: hasAam(grounds),
    jurisdiction: !!jurPosted || !!jurCause || limitation !== "noDelay",
    interim: !!interimNil || hasAam(interimReliefs),
    other: !!String(postalOrders ?? "").trim(),
  };

  // ── Section editors ─────────────────────────────────────────────────────────
  const synopsisEditor = (
    <FormField control={form.control} name="synopsis" render={({ field }) => (
      <FormItem className="flex h-full flex-col"><FormControl>
        <BadhiyaBox value={field.value} onChange={field.onChange} path={field.name} />
      </FormControl></FormItem>
    )} />
  );

  const lodEditor = (
    <div className="space-y-2">
      <FormField
        control={form.control}
        name="oa.splitSynopsisAndLod"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Checkbox id="oa-split" checked={field.value} onCheckedChange={field.onChange} />
            <label htmlFor="oa-split" className="text-xs cursor-pointer">Start List of Dates on a fresh page</label>
          </div>
        )}
      />
      <LoDTable hideAnnexures={annexureMode === "facts"} />
    </div>
  );

  const reliefsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Main prayers — used in Para 1 (inline) and Para 8 (Prayers). The residuary “Pass such other/further orders…” is added automatically.</p>
        <div className="flex items-center gap-1.5">
          <StylePicker name="oa.numbering.prayer" options={SUBPARA_STYLES_PRAYER} />
        </div>
      </div>
      <AamTable name="oa.reliefs" />
      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium">Added automatically as the last prayer — you don’t need to type it:</span>{" "}
        {OA_RESIDUARY}
      </p>
    </div>
  );

  const factsEditor = (
    <FactsSection
      factsPath="oa.factsRows"
      annexureModePath="oa.annexureMode"
      storedFactsPath="oa.facts"
      subtitle="Para 4 — one row per sub-paragraph, with the annexures attached here or in the List of Dates."
      headerExtra={
        <div className="flex items-center gap-1.5">
          <StylePicker name="oa.numbering.facts" options={subparaStyles(4)} />
        </div>
      }
    />
  );

  const groundsEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-end"><StylePicker name="oa.numbering.grounds" options={subparaStyles(5)} /></div>
      <AamTable name="grounds" allowHeadings />
    </div>
  );

  // ── Preliminary Contents (Parties, Jurisdiction, Limitation) ───────────────
  const prelimPartiesContent = (
    <div className="space-y-4 max-w-4xl">
      <p className="text-xs text-muted-foreground">
        Before the Central Administrative Tribunal, <span className="font-medium">{bench.header}</span>. Change the Bench in Settings → Original Application.
      </p>
      <FormField control={form.control} name="oa.legalAid" render={({ field }) => (
        <div className="flex items-center gap-2"><Checkbox id="oa-legal-aid" checked={field.value} onCheckedChange={field.onChange} />
          <label htmlFor="oa-legal-aid" className="text-xs">Legal-aid case assigned by the Delhi State Legal Services Authority</label></div>
      )} />

      {/* Multi-applicant signing. Only meaningful with several Applicants. */}
      <div className="space-y-1.5 rounded-md border border-neutral-200 bg-neutral-100/60 p-2.5 dark:border-neutral-700 dark:bg-neutral-800/40">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Signing {applicantCount <= 1 && <span className="font-normal normal-case">— applies once there is more than one Applicant</span>}
        </p>
        {([
          ["oa.authorityLetters", "oa-cb-auth", "Applicant No. 2 onwards will sign Authority Letters in favour of Applicant No. 1."],
          ["oa.separateLastPages", "oa-cb-lastpage", "Each Applicant will sign a different Last Page."],
          ["oa.separateVakalatnamas", "oa-cb-vak", "Each Applicant will sign a different Vakalatnama."],
        ] as const).map(([name, id, label]) => (
          <FormField key={id} control={form.control} name={name} render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox id={id} checked={field.value} onCheckedChange={field.onChange} disabled={applicantCount <= 1} className="mt-0.5" />
              <label htmlFor={id} className={"text-xs leading-snug " + (applicantCount <= 1 ? "text-muted-foreground" : "")}>{label}</label>
            </div>
          )} />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memo of Parties</span>
        <MayurButton section="parties" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium">{applNoun}</p>
          <p className="mb-1 text-[11px] text-muted-foreground">Each Applicant’s own particulars are used on the last page, vakalatnama and affidavit they sign.</p>
          <VaadiTable name="petitioners" showPosition={false} showThrough throughPlaceholder={APPLICANT_THROUGH_PLACEHOLDER} compactAdd showDeponentDetails />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">{resNoun}</p>
          <VaadiTable name="respondents" showPosition={false} showThrough throughPlaceholder={RESPONDENT_THROUGH_PLACEHOLDER} compactAdd />
        </div>
      </div>
    </div>
  );

  const prelimJurisdictionContent = (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <div>
          <h4 className="text-sm font-semibold">Para 2 — Jurisdiction</h4>
          <p className="text-xs text-muted-foreground">Declare territorial and subject-matter jurisdiction before this Hon’ble Tribunal.</p>
        </div>
        <MayurButton section="oa-jurisdiction" />
      </div>

      <div className="space-y-3 pt-2">
        <FormField control={form.control} name="oa.jurisdictionPosted" render={({ field }) => (
          <div className="flex items-start gap-2">
            <Checkbox id="oa-jur-posted" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            <label htmlFor="oa-jur-posted" className="text-xs font-medium leading-snug cursor-pointer">
              The {applNoun} {applIs} posted for the time being within the jurisdiction of this Hon’ble Tribunal.
            </label>
          </div>
        )} />
        <FormField control={form.control} name="oa.jurisdictionPostedNote" render={({ field }) => (
          <div className="pl-6">
            <Textarea {...field} rows={2} placeholder="Optional rider explaining posting particulars…" className="text-xs" />
          </div>
        )} />

        <FormField control={form.control} name="oa.jurisdictionCause" render={({ field }) => (
          <div className="flex items-start gap-2 pt-2 border-t">
            <Checkbox id="oa-jur-cause" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
            <label htmlFor="oa-jur-cause" className="text-xs font-medium leading-snug cursor-pointer">
              The cause of action of the present OA arose within the jurisdiction of this Hon’ble Tribunal.
            </label>
          </div>
        )} />
        <FormField control={form.control} name="oa.jurisdictionCauseNote" render={({ field }) => (
          <div className="pl-6">
            <Textarea {...field} rows={2} placeholder="Optional rider explaining cause of action particulars…" className="text-xs" />
          </div>
        )} />
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-2.5 mt-2">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> If neither box is ticked, the Section-25 declaration prints in the OA and a <strong>Petition for Transfer (PT)</strong> is automatically generated in the <em>Applications</em> tab.
        </p>
      </div>
    </div>
  );

  const prelimLimitationContent = (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <div>
          <h4 className="text-sm font-semibold">Para 3 — Limitation</h4>
          <p className="text-xs text-muted-foreground">Select the limitation declaration for Para 3 of the Original Application.</p>
        </div>
        <MayurButton section="oa-jurisdiction" />
      </div>

      <div className="pt-2">
        <FormField control={form.control} name="oa.limitation" render={({ field }) => (
          <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2.5">
            <div className="flex items-start gap-2.5 rounded-md border p-3 bg-card hover:bg-muted/40 transition-colors">
              <RadioGroupItem value="noDelay" id="lim-none" className="mt-0.5" />
              <div className="space-y-0.5">
                <label htmlFor="lim-none" className="text-xs font-semibold cursor-pointer">Within Limitation (No Delay)</label>
                <p className="text-xs text-muted-foreground leading-snug">
                  The {applNoun} {applDeclares} that there is no delay in filing of the present OA and the same is within limitation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-md border p-3 bg-card hover:bg-muted/40 transition-colors">
              <RadioGroupItem value="delay" id="lim-delay" className="mt-0.5" />
              <div className="space-y-1.5 flex-grow">
                <label htmlFor="lim-delay" className="text-xs font-semibold cursor-pointer">Delay in Filing (Application for Condonation)</label>
                <p className="text-xs text-muted-foreground leading-snug">
                  The {applNoun} {applDeclares} that there is a delay of{" "}
                  <span className="font-semibold text-foreground">{delayDays?.trim() || "__"}</span> days in filing of this OA and an
                  application for condonation of delay of the said period is being filed along with this OA.
                </p>
                {limitation === "delay" && (
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <span>Delay of</span>
                    <FormField control={form.control} name="oa.delayDays" render={({ field }) => (
                      <Input {...field} placeholder="__" className="h-7 w-20 px-2 text-xs font-medium" />
                    )} />
                    <span>days</span>
                    <span className="text-[11px] text-muted-foreground">(auto-calculated from the last Impugned Order; editable)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-md border p-3 bg-card hover:bg-muted/40 transition-colors">
              <RadioGroupItem value="abundantCaution" id="lim-caution" className="mt-0.5" />
              <div className="space-y-0.5">
                <label htmlFor="lim-caution" className="text-xs font-semibold cursor-pointer">By Way of Abundant Caution (Without Prejudice)</label>
                <p className="text-xs text-muted-foreground leading-snug">
                  The {applNoun} {applDeclares} that there is no delay in filing of the present OA and the same is within
                  limitation. However, by way of abundant caution and without prejudice to the {applPossessive} aforesaid
                  stance, an application for condonation of delay is being filed along with this OA.
                </p>
              </div>
            </div>
          </RadioGroup>
        )} />
      </div>

      <div className="pt-2">
        <FormField control={form.control} name="oa.limitationNote" render={({ field }) => (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Optional rider to append to the limitation declaration:</label>
            <Textarea {...field} rows={2} placeholder="Optional rider to add after the above declaration…" className="text-xs" />
          </div>
        )} />
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-2.5 mt-2">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> The second and third options automatically generate a <strong>Condonation-of-Delay (MA)</strong> application in the <em>Applications</em> tab.
        </p>
      </div>
    </div>
  );

  const handleResetAdvocateToDefaults = () => {
    const fb = getOaFiledBy();
    form.setValue("oa.advocate.name", fb.name, { shouldDirty: true });
    form.setValue("oa.advocate.address", fb.address, { shouldDirty: true });
    form.setValue("oa.advocate.firm", fb.firm, { shouldDirty: true });
    form.setValue("oa.advocate.enrolmentNo", fb.enrolmentNo, { shouldDirty: true });
    form.setValue("oa.advocate.email", fb.email, { shouldDirty: true });
    form.setValue("oa.advocate.phone", fb.phone, { shouldDirty: true });
  };

  const prelimAdvocateContent = (
    <div className="space-y-4 max-w-2xl text-xs">
      <div className="flex items-center justify-between pb-2 border-b">
        <div>
          <h3 className="font-semibold text-sm">Advocate Details (&ldquo;Filed by&rdquo; Block)</h3>
          <p className="text-muted-foreground text-xs">
            These details appear on the &ldquo;Filed by&rdquo; table at the foot of the Original Application and on the Vakalatnama.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleResetAdvocateToDefaults}
          className="text-xs h-7"
          title="Reset to default details configured in Settings → Advocate Info"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to Settings Defaults
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField control={form.control} name="oa.advocate.name" render={({ field }) => (
          <FormItem><Field label="Advocate Name *"><Input {...field} placeholder="e.g. Adv. Jane Doe" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="oa.advocate.firm" render={({ field }) => (
          <FormItem><Field label="Firm / Chamber Name"><Input {...field} placeholder="e.g. Legal Associates" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="oa.advocate.enrolmentNo" render={({ field }) => (
          <FormItem><Field label="Enrolment No."><Input {...field} placeholder="e.g. D/1234/2015" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="oa.advocate.phone" render={({ field }) => (
          <FormItem><Field label="Phone No."><Input {...field} placeholder="e.g. +91 98765 43210" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="oa.advocate.email" render={({ field }) => (
          <FormItem className="md:col-span-2"><Field label="Email Address"><Input {...field} placeholder="e.g. advocate@example.com" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="oa.advocate.address" render={({ field }) => (
          <FormItem className="md:col-span-2"><Field label="Chamber / Office Address *"><Textarea {...field} rows={2} placeholder="e.g. Chamber No. 123, Central Administrative Tribunal, New Delhi - 110001" className="text-xs" /></Field></FormItem>
        )} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t">
        <FormField control={form.control} name="advocate.filingPlace" render={({ field }) => (
          <FormItem><Field label="Filing Place"><Input {...field} placeholder="New Delhi" className="h-8 text-xs" /></Field></FormItem>
        )} />
        <FormField control={form.control} name="advocate.filingDate" render={({ field }) => (
          <FormItem><Field label="Filing Date"><DateInput value={field.value as Date} onChange={field.onChange} /></Field></FormItem>
        )} />
      </div>
    </div>
  );

  const partiesFilled = (rows: any[]) =>
    Array.isArray(rows) && rows.length > 0 && rows.every((r: any) => String(r?.name ?? "").trim().length > 0);
  const prelimPartiesReady = partiesFilled(petitioners) && partiesFilled(respondents);
  const prelimJurisdictionReady = !!jurPosted || !!jurCause;
  const prelimLimitationReady = !!limitation && (limitation !== "delay" || !!delayDays?.trim());
  const prelimAdvocateReady = !!(String(oaAdv?.name ?? "").trim() && String(oaAdv?.address ?? "").trim());

  const prelimItems: { id: "parties" | "jurisdiction" | "limitation" | "advocate"; label: string; active: boolean }[] = [
    { id: "parties", label: "Memo of Parties", active: prelimPartiesReady },
    { id: "jurisdiction", label: "Jurisdiction", active: prelimJurisdictionReady },
    { id: "limitation", label: "Limitation", active: prelimLimitationReady },
    { id: "advocate", label: "Advocate Details", active: prelimAdvocateReady },
  ];

  const prelimContentMap = {
    parties: prelimPartiesContent,
    jurisdiction: prelimJurisdictionContent,
    limitation: prelimLimitationContent,
    advocate: prelimAdvocateContent,
  };

  const interimEditor = (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 9 — Interim Relief</p>
      </div>
      <FormField control={form.control} name="oa.interimNil" render={({ field }) => (
        <div className="flex items-center gap-2"><Checkbox id="oa-interim-nil" checked={field.value} onCheckedChange={field.onChange} />
          <label htmlFor="oa-interim-nil" className="text-xs">NIL (no interim relief sought)</label></div>
      )} />
      {!interimNil && (
        <div className="space-y-2">
          <div className="flex items-center justify-end"><StylePicker name="oa.numbering.interim" options={SUBPARA_STYLES_PRAYER} /></div>
          <AamTable name="oa.interimReliefs" />
          <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium">Added automatically as the last prayer — you don’t need to type it:</span>{" "}
            {OA_RESIDUARY}
          </p>
        </div>
      )}
    </div>
  );

  const otherEditor = (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para 11 — Particulars of postal orders (Application Fee)</p>
      <FormField control={form.control} name="oa.postalOrders" render={({ field }) => (<Textarea {...field} rows={3} placeholder="Postal-order particulars (blank allowed)…" className="text-xs" />)} />
    </div>
  );

  const editorContent: Record<OaSection, React.ReactNode> = {
    synopsis: synopsisEditor,
    listOfDates: lodEditor,
    reliefs: reliefsEditor,
    facts: factsEditor,
    grounds: groundsEditor,
    jurisdiction: prelimJurisdictionContent,
    interim: interimEditor,
    other: otherEditor,
  };

  const editorSectionsList: { id: OaSection; label: string; active: boolean }[] = [
    { id: "listOfDates", label: "List of Dates", active: active.listOfDates },
    { id: "grounds", label: "Grounds", active: active.grounds },
    { id: "synopsis", label: "Synopsis", active: active.synopsis },
    { id: "facts", label: "Facts", active: active.facts },
    { id: "reliefs", label: "Main Prayers", active: active.reliefs },
    { id: "interim", label: "Interim Relief", active: active.interim },
    { id: "other", label: "Postal Orders", active: active.other },
  ];

  return (
    <Tabs defaultValue="preliminary" className="p-1">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="preliminary">Preliminary</TabsTrigger>
        <TabsTrigger value="oa">Original Application</TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
      </TabsList>

      {/* ── Preliminary (Nav Panel: Parties, Jurisdiction, Limitation) ── */}
      <TabsContent value="preliminary" className="mt-1">
        <div className={cn("flex flex-col", PANEL_H)}>
          <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="oa-prelim-nav">
            <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
              <div className="flex h-full flex-col space-y-1 p-2">
                <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Preliminary
                </p>
                {prelimItems.map((item) => (
                  <NavRow
                    key={item.id}
                    label={item.label}
                    active={item.active}
                    selected={prelimSection === item.id}
                    onClick={() => setPrelimSection(item.id)}
                  />
                ))}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={80} minSize={65}>
              <div key={prelimSection} className="h-full overflow-auto p-4">
                {prelimContentMap[prelimSection]}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </TabsContent>

      {/* ── Original Application body (Modular 2/3 pane) ── */}
      <TabsContent value="oa" className="mt-1">
        <EditorProvider>
          <div className={cn("flex flex-col", PANEL_H)}>
            <div className="mb-1 flex items-center gap-1.5">
              {/* Panes Switch Button: 1-click toggle between 3 Panes and 2 Panes */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePaneCount}
                className="h-8 text-xs gap-1.5 px-2.5 font-normal cursor-pointer select-none"
                title={paneCount === 3 ? "Click to switch to 2 Panes" : "Click to switch to 3 Panes"}
              >
                {paneCount === 3 ? (
                  <>
                    <Columns3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>3 Panes</span>
                  </>
                ) : (
                  <>
                    <Columns2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>2 Panes</span>
                  </>
                )}
              </Button>

              {/* View Next Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewNext}
                className="h-8 text-xs gap-1.5 px-2.5 font-normal cursor-pointer"
                title="Cycle to next set of sections"
              >
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span>View Next</span>
              </Button>

              {/* Postal Orders (Fee particulars) compact dialog */}
              <SectionDialog label="Postal Orders" active={active.other} className="h-8 gap-1.5 text-xs font-normal px-2.5">
                {otherEditor}
              </SectionDialog>

              <div className="flex-grow" />
              <EditorToolbar />
            </div>

            {maximizedPane !== null ? (
              <div className="flex-grow rounded-lg border p-1.5 flex flex-col min-h-0 bg-card">
                <OaPaneHeader
                  paneIndex={maximizedPane}
                  section={paneSlots[maximizedPane]}
                  onSelectSection={(s) => handleSelectPane(maximizedPane, s)}
                  sections={editorSectionsList}
                  isMaximized={true}
                  onToggleMaximize={() => setMaximizedPane(null)}
                />
                <div key={paneSlots[maximizedPane]} className="flex-grow overflow-auto min-h-0 pt-1">
                  {editorContent[paneSlots[maximizedPane]]}
                </div>
              </div>
            ) : paneCount === 2 ? (
              <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="oa-editor-panels-2">
                <ResizablePanel defaultSize={50} minSize={25}>
                  <div className="flex flex-col h-full p-1.5">
                    <OaPaneHeader
                      paneIndex={0}
                      section={paneSlots[0]}
                      onSelectSection={(s) => handleSelectPane(0, s)}
                      sections={editorSectionsList}
                      isMaximized={false}
                      onToggleMaximize={() => setMaximizedPane(0)}
                    />
                    <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                      {editorContent[paneSlots[0]]}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={25}>
                  <div className="flex flex-col h-full p-1.5">
                    <OaPaneHeader
                      paneIndex={1}
                      section={paneSlots[1]}
                      onSelectSection={(s) => handleSelectPane(1, s)}
                      sections={editorSectionsList}
                      isMaximized={false}
                      onToggleMaximize={() => setMaximizedPane(1)}
                    />
                    <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                      {editorContent[paneSlots[1]]}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <ResizablePanelGroup direction="horizontal" className="flex-grow rounded-lg border" autoSaveId="oa-editor-panels-3">
                <ResizablePanel defaultSize={48} minSize={20}>
                  <div className="flex flex-col h-full p-1.5">
                    <OaPaneHeader
                      paneIndex={0}
                      section={paneSlots[0]}
                      onSelectSection={(s) => handleSelectPane(0, s)}
                      sections={editorSectionsList}
                      isMaximized={false}
                      onToggleMaximize={() => setMaximizedPane(0)}
                    />
                    <div key={paneSlots[0]} className="flex-grow overflow-auto min-h-0 pt-1">
                      {editorContent[paneSlots[0]]}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={32} minSize={20}>
                  <div className="flex flex-col h-full p-1.5">
                    <OaPaneHeader
                      paneIndex={1}
                      section={paneSlots[1]}
                      onSelectSection={(s) => handleSelectPane(1, s)}
                      sections={editorSectionsList}
                      isMaximized={false}
                      onToggleMaximize={() => setMaximizedPane(1)}
                    />
                    <div key={paneSlots[1]} className="flex-grow overflow-auto min-h-0 pt-1">
                      {editorContent[paneSlots[1]]}
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20} minSize={15}>
                  <div className="flex flex-col h-full p-1.5">
                    <OaPaneHeader
                      paneIndex={2}
                      section={paneSlots[2]}
                      onSelectSection={(s) => handleSelectPane(2, s)}
                      sections={editorSectionsList}
                      isMaximized={false}
                      onToggleMaximize={() => setMaximizedPane(2)}
                    />
                    <div key={paneSlots[2]} className="flex-grow overflow-auto min-h-0 pt-1">
                      {editorContent[paneSlots[2]]}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </EditorProvider>
      </TabsContent>

      {/* ── Applications (MAs / PT) ── */}
      <TabsContent value="applications" className="mt-1 p-1">
        <div className={cn("flex flex-col", PANEL_H)}>
          <OaApplications />
        </div>
      </TabsContent>

    </Tabs>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { Settings, FolderOpen, RefreshCw, ExternalLink, Moon, Sun, Download, CheckCircle, AlertCircle, Loader2, Info, Sparkles, XCircle, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getGenerationCounts, type UsageCounts } from "@/lib/firebase/usage-service";
import { ManageDevices } from "@/components/auth/manage-devices";
import { useEntitlement } from "@/providers/entitlement-provider";
import { ENTITLEMENT_ENABLED } from "@/lib/entitlement/entitlement-enabled";
import { FORUM_LABEL, type Plan, type EntitlementReason } from "@/lib/entitlement/entitlement";
import { OA_BENCHES, DEFAULT_OA_BENCH } from "@/lib/oa/oa-benches";
import { WP_NUMBER_STYLES, DEFAULT_WP_NUMBERING, type WpNumbering, DEFAULT_WP_FILED_BY, type WpFiledBy, type WpFiledByLayoutItem, type WpFiledByCaps, WP_FILED_BY_ITEM_LABELS, normalizeWpFiledByLayout, wpFiledByLines } from "@/lib/wp/wp-settings";
import type { EnumStyle } from "@/lib/wp/wp-numbering";
import { LICENSE_TEXT, TERMS_TEXT } from "@/lib/legal";
import { cn } from "@/lib/utils";

type SlpTabView = 'splitter' | 'navigation';
type QuoteLineSpacing = 'default' | 'single';
type TrueCopyPosition = 'left' | 'center';
/** 'short' = the title block Drafto has always produced; 'sci' = the long form. */
type SlpHeaderStyle = 'short' | 'sci';
type AiModel = 'default' | 'haiku' | 'sonnet' | 'opus';
type SettingsSection = 'interface' | 'customize' | 'save' | 'shortcuts' | 'support' | 'slp' | 'wp' | 'oa';

// Court tag shown next to each document-type nav item.
type CourtTag = 'SC' | 'HC' | 'CAT';
const COURT_TAG_CLASS: Record<CourtTag, string> = {
  SC: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  HC: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  CAT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
};

interface SettingsData {
  defaultDocxPath: string;
  defaultPdfPath: string;
  defaultDraftoPath: string;

  uiFont: string;        // interface font (CSS font-family stack)
  uiFontSize: number;    // interface text size, px (root font-size)
  inputFont: string;     // editing font for form fields + rich-text editor
  inputFontSize: number; // editing text size, px
  annexureLabelBackground: boolean;
  annexureLabelSize: number;
  annexureLabelMarginPt: number;   // top margin (pt) of the "Annexure P-X" label

  // Page numbers stamped on the paperbook
  pageNumberSizePt: number;        // font size (pt) of the numeric/alphabetical page number
  pageNumberMarginTopPt: number;   // distance (pt) from the top edge
  pageNumberMarginRightPt: number; // distance (pt) from the right edge

  // True Copy + signature combo stamped at the bottom of every annexure
  trueCopyMarginXPt: number;       // horizontal margin (pt) from the page edge
  trueCopyMarginBottomPt: number;  // vertical margin (pt) from the bottom edge

  // Advocate's Checklist formatting (PDF paperbook)
  checklistFontSizePt: number;
  checklistLineSpacing: number;
  checklistParaSpacingPt: number;  // before/after spacing on each cell paragraph
  checklistMarginTopInches: number;   // page top margin (inches)
  checklistMarginLeftInches: number;  // page left margin (inches)

  exportHighlight: boolean;
  autosaveInterval: number;
  toastDuration: number;
  slpTabView: SlpTabView;
  quoteLineSpacing: QuoteLineSpacing;

  // Volume splitting
  volumeSplitThreshold: number;
  volumeStepSize: number;
  maxComponentSplitPages: number;
  minVolumeTailPages: number;
  minVolumeHeadPages: number;
  separateVolumePdfs: boolean;

  // AoR Signature & True Copy (Beta)
  aorSignaturePng: string;   // data URL (data:image/png;base64,...)
  aorSignatureW: number;     // natural pixel width  (for aspect ratio)
  aorSignatureH: number;     // natural pixel height (for aspect ratio)
  placeSignatureInPaperbook: boolean;
  placeTrueCopyText: boolean;
  signatureSizePx: number;   // display width of the Filed-by signature, in px
  trueCopyPosition: TrueCopyPosition;  // bottom-left or bottom-center of annexure pages
  trueCopyBackground: boolean;         // white background behind the True Copy stamp

  // Output text formatting (body of the SLP)
  outputFont: string;
  outputFontSizePt: number;
  outputLineSpacing: number;
  outputParaAfterPt: number;

  // Drafting preferences for the SLP (defaults preserve the older output)
  slpHeaderStyle: SlpHeaderStyle;       // short title block, or the SCI long form
  slpHeadingBreak: boolean;             // heading on its own line, text beneath
  slpTranslatedCopyFirst: boolean;      // translated/typed copy before the true copy

  // HC / CAT: reproduce the List of Dates in the Facts (the historical way), or
  // keep a concise List of Dates and a Facts table of its own.
  wpFactsFromLod: boolean;
  oaFactsFromLod: boolean;

  // AI Plugin (Beta) — bring-your-own Claude Code CLI
  aiPluginEnabled: boolean;
  aiClaudeBinaryPath: string;  // optional override; blank = auto-detect on PATH
  aiModel: AiModel;            // 'default' = the CLI's configured model

  // User Defaults — pre-filled into every new project
  defaultAorName: string;
  defaultAorCode: string;

  // Writ Petition — per-section sub-paragraph numbering styles
  wpNumbering: WpNumbering;
  // Writ Petition — "Filed by" advocate defaults
  wpFiledBy: WpFiledBy;
  // Writ Petition — advocate signature for the "Filed by" blocks (PDF path only;
  // separate from the SLP AoR signature)
  wpSignaturePng: string;    // data URL (data:image/png;base64,...)
  wpSignatureW: number;      // natural pixel width  (for aspect ratio)
  wpSignatureH: number;      // natural pixel height (for aspect ratio)
  wpPlaceSignatureInPaperbook: boolean;
  wpSignatureSizePx: number; // display width of the signature, in px

  // SLP — page margins (inches)
  slpMarginTopIn: number;
  slpMarginRightIn: number;
  slpMarginBottomIn: number;
  slpMarginLeftIn: number;
  // Writ Petition — page margins (inches)
  wpMarginTopIn: number;
  wpMarginRightIn: number;
  wpMarginBottomIn: number;
  wpMarginLeftIn: number;
  // Writ Petition — output text formatting (mirrors the SLP set + before-spacing)
  wpOutputFont: string;
  wpOutputFontSizePt: number;
  wpOutputLineSpacing: number;
  wpOutputParaBeforePt: number;
  wpOutputParaAfterPt: number;
  // Writ Petition — "Filed by" table left-column share (%)
  wpFiledByLeftPct: number;
  // Writ Petition — "Filed by" advocate-details layout (order / joins / styling)
  wpFiledByLayout: WpFiledByLayoutItem[];
  // Writ Petition — PDF stamps (annexure labels / page numbers / True Copy)
  wpStampFont: 'times' | 'helvetica' | 'courier';
  wpPageNumberSizePt: number;
  wpPageNumberMarginTopPt: number;
  wpPageNumberMarginRightPt: number;
  wpAnnexureLabelSizePt: number;
  wpAnnexureLabelMarginPt: number;
  wpAnnexureLabelPosition: 'center' | 'right';
  wpStampBackground: boolean;
  wpPlaceTrueCopyText: boolean;
  wpTrueCopyPosition: 'left' | 'center';
  wpTrueCopyBackground: boolean;
  wpTrueCopyMarginXPt: number;
  wpTrueCopyMarginBottomPt: number;

  // ── Original Application (CAT) ──
  oaBench: string; // bench value, see @/lib/oa/oa-benches
  oaFiledBy: WpFiledBy; // advocate details for the OA "Filed by" block
  oaFiledByLeftPct: number;
  oaFiledByLayout: WpFiledByLayoutItem[];
  oaSignaturePng: string;
  oaSignatureW: number;
  oaSignatureH: number;
  oaPlaceSignatureInPaperbook: boolean;
  oaSignatureSizePx: number;
  // CAT — PDF stamps (annexure labels / page numbers / True Copy)
  oaStampFont: 'times' | 'helvetica' | 'courier';
  oaPageNumberSizePt: number;
  oaPageNumberMarginTopPt: number;
  oaPageNumberMarginRightPt: number;
  oaAnnexureLabelSizePt: number;
  oaAnnexureLabelMarginPt: number;
  oaAnnexureLabelPosition: 'center' | 'right';
  oaStampBackground: boolean;
  oaPlaceTrueCopyText: boolean;
  oaTrueCopyPosition: 'left' | 'center';
  oaTrueCopyBackground: boolean;
  oaTrueCopyMarginXPt: number;
  oaTrueCopyMarginBottomPt: number;
  // CAT — page margins & body formatting (independent of the HC settings)
  oaMarginTopIn: number;
  oaMarginRightIn: number;
  oaMarginBottomIn: number;
  oaMarginLeftIn: number;
  oaOutputFont: string;
  oaOutputFontSizePt: number;
  oaOutputLineSpacing: number;
  oaOutputParaBeforePt: number;
  oaOutputParaAfterPt: number;
  // Vakalatnama formatting (fits one page): CAT + HC
  oaVakFontSizePt: number;
  oaVakLineSpacing: number;
  oaVakParaSpacingPt: number;
  wpVakFontSizePt: number;
  wpVakLineSpacing: number;
  wpVakParaSpacingPt: number;
  // CAT — force the Last Page (Para 10 onwards) onto a fresh page
  oaForceLastPageBreak: boolean;
}

// Fonts offered for the output text formatting
const OUTPUT_FONTS = [
  "Arial", "Cambria", "Calibri", "Tahoma", "Verdana", "Georgia", "Garamond",
  "Times New Roman", "Equity Text A", "Tinos", "Calisto MT", "Bookman Old Style",
  "Century Schoolbook", "Century",
];

// System fonts offered for the on-screen interface / editing text. Values are
// full CSS font-family stacks with cross-platform fallbacks (no bundled fonts),
// so they render the same offline on macOS and Windows.
const SYSTEM_FONTS: { label: string; value: string }[] = [
  { label: "Arial", value: 'Arial, Helvetica, sans-serif' },
  { label: "Helvetica", value: 'Helvetica, Arial, sans-serif' },
  { label: "Verdana", value: 'Verdana, Geneva, sans-serif' },
  { label: "Tahoma", value: 'Tahoma, Geneva, sans-serif' },
  { label: "Trebuchet MS", value: '"Trebuchet MS", Helvetica, sans-serif' },
  { label: "Segoe UI", value: '"Segoe UI", system-ui, sans-serif' },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Cambria", value: 'Cambria, Georgia, serif' },
  { label: "Garamond", value: 'Garamond, "Times New Roman", serif' },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
];

// Appearance defaults, used by the "Restore Defaults" button. The font default
// (Arial) matches the app's historical look, so restoring returns to today's
// appearance.
const DEFAULT_UI_FONT = 'Arial, Helvetica, sans-serif';
const DEFAULT_INPUT_FONT = 'Arial, Helvetica, sans-serif';
const DEFAULT_UI_FONT_SIZE = 16;    // px — root font-size; matches the historical compact view
// Editing text defaults a little smaller than the interface (the historical
// look); overlap at larger sizes is handled by the proportional line-height in
// globals.css, so the two sizes can be set independently.
const DEFAULT_INPUT_FONT_SIZE = 12; // px

// Numeric text-size choices (px) offered in Settings → Appearance.
const UI_FONT_SIZES = [13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28];
const INPUT_FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

const APPEARANCE_DEFAULTS = {
  theme: 'light' as const,
  uiFont: DEFAULT_UI_FONT,
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  inputFont: DEFAULT_INPUT_FONT,
  inputFontSize: DEFAULT_INPUT_FONT_SIZE,
};

const SETTINGS_KEY = "drafto-settings";

// Keyboard shortcuts shown in Settings → Shortcuts. `keys` is a list of key
// combinations (alternatives) where each combination is an array of key labels.
type Shortcut = { keys: string[][]; action: string; note?: string };
type ShortcutGroup = { title: string; hint?: string; items: Shortcut[] };

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    hint: "Work anywhere in the app.",
    items: [
      { keys: [["Ctrl", "S"]], action: "Save project" },
      { keys: [["Ctrl", "F"]], action: "Open the Find & Replace bar" },
      { keys: [["Ctrl", "R"]], action: "Right-align text (inside a text field). Page reload is disabled so your work is never lost." },
    ],
  },
  {
    title: "Find & Replace bar",
    items: [
      { keys: [["Enter"]], action: "Go to next match" },
      { keys: [["Shift", "Enter"]], action: "Go to previous match" },
      { keys: [["Esc"]], action: "Close the bar" },
    ],
  },
  {
    title: "Text formatting",
    hint: "Inside any text field (synopsis, grounds, particulars, prayers, etc.).",
    items: [
      { keys: [["Ctrl", "B"]], action: "Bold" },
      { keys: [["Ctrl", "I"]], action: "Italic" },
      { keys: [["Ctrl", "U"]], action: "Underline" },
      { keys: [["Ctrl", "H"]], action: "Highlight (yellow)", note: "Always Ctrl, even on Mac" },
    ],
  },
  {
    title: "Alignment",
    items: [
      { keys: [["Ctrl", "L"]], action: "Align left" },
      { keys: [["Ctrl", "E"]], action: "Align centre" },
      { keys: [["Ctrl", "R"]], action: "Align right" },
      { keys: [["Ctrl", "J"]], action: "Justify" },
    ],
  },
  {
    title: "Lists & structure",
    items: [
      { keys: [["Tab"]], action: "Indent / nest a list item (up to 5 levels)" },
      { keys: [["Shift", "Tab"]], action: "Outdent a list item" },
      { keys: [["Enter"]], action: "New paragraph / list item (also exits a quote inside a list)" },
      { keys: [["Shift", "Enter"]], action: "Line break within the same paragraph" },
      { keys: [["Backspace"]], action: "At the start of a line right after a list, rejoins it into the last point" },
      { keys: [["Ctrl", "Shift", "7"]], action: "Numbered list" },
      { keys: [["Ctrl", "Shift", "8"]], action: "Bullet list" },
      { keys: [["Ctrl", "Shift", "B"]], action: "Blockquote" },
      { keys: [["Ctrl", "Shift", "S"]], action: "Strikethrough" },
    ],
  },
  {
    title: "Undo / redo",
    hint: "Applies to the text inside the field you are editing.",
    items: [
      { keys: [["Ctrl", "Z"]], action: "Undo" },
      { keys: [["Ctrl", "Shift", "Z"], ["Ctrl", "Y"]], action: "Redo" },
    ],
  },
  {
    title: "Tables",
    hint: "In the List of Dates and particulars/grounds rows.",
    items: [
      { keys: [["Ctrl", "Space"]], action: "Insert a new row directly below", note: "Always Ctrl, even on Mac" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.4rem] px-1.5 py-0.5 rounded border border-border bg-muted text-[10px] font-semibold leading-none text-foreground shadow-[0_1px_0_rgba(0,0,0,0.08)]">
      {children}
    </kbd>
  );
}

function ShortcutKeys({ keys }: { keys: string[][] }) {
  return (
    <span className="flex items-center gap-1 flex-wrap justify-end">
      {keys.map((combo, ci) => (
        <span key={ci} className="flex items-center gap-1">
          {ci > 0 && <span className="text-[10px] text-muted-foreground px-0.5">or</span>}
          {combo.map((k, ki) => (
            <span key={ki} className="flex items-center gap-1">
              {ki > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
              <Kbd>{k}</Kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function PrereqRow({ ok, label, detail, warnOnly }: { ok: boolean; label: string; detail: string; warnOnly?: boolean }) {
  // warnOnly: a missing item is a warning (amber) rather than a hard failure (red).
  const Icon = ok ? CheckCircle : warnOnly ? AlertCircle : XCircle;
  const color = ok
    ? "text-green-600 dark:text-green-400"
    : warnOnly
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">— {detail}</span>
    </div>
  );
}

function SettingsNavRow({ label, selected, onClick, tag }: { label: string; selected: boolean; onClick: () => void; tag?: CourtTag }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md text-xs transition-colors",
        selected
          ? "bg-primary text-primary-foreground dark:text-white font-medium"
          : "hover:bg-muted text-foreground"
      )}
    >
      <span className="truncate">{label}</span>
      {tag && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
            selected ? "bg-white/20 text-white" : COURT_TAG_CLASS[tag],
          )}
        >
          {tag}
        </span>
      )}
    </button>
  );
}
// ─── Compact settings layout ───────────────────────────────────────────────
// Every settings page follows one grammar: a group heading, then one setting
// per line — label on the left, controls on the right. Nothing is explained in
// prose; anything that needs a note carries an (i) tooltip instead.

function InfoTip({ text, about }: { text: React.ReactNode; about?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="shrink-0 text-muted-foreground/70 hover:text-foreground"
            aria-label={about ? `About ${about}` : "More information"}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          className="max-w-[300px] whitespace-pre-line text-xs font-normal leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const BetaTag = () => (
  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
    Beta
  </span>
);

function SettingsGroup({
  title,
  info,
  beta,
  icon,
  children,
}: { title: string; info?: React.ReactNode; beta?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 border-b pb-1">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">{title}</p>
        {beta && <BetaTag />}
        {info && <InfoTip text={info} about={title} />}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// One setting on one line. The label column is fixed so every row lines up.
function SettingRow({
  label,
  info,
  htmlFor,
  children,
}: { label?: string; info?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[28px] items-center gap-2">
      {label !== undefined && (
        <div className="flex w-[164px] shrink-0 items-center gap-1">
          <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">{label}</Label>
          {info && <InfoTip text={info} about={label} />}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// A checkbox setting: box first, then the label it turns on.
function CheckRow({
  id,
  checked,
  onChange,
  label,
  info,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  info?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-[28px] items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 disabled:opacity-40"
      />
      <Label htmlFor={id} className="cursor-pointer text-xs font-normal text-muted-foreground">{label}</Label>
      {info && <InfoTip text={info} about={label} />}
    </div>
  );
}

// Segmented control — the [This] [That] pairs used for either/or choices.
function SegGroup<T extends string>({
  value,
  onChange,
  options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-primary font-medium text-primary-foreground dark:text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Unit or qualifier printed beside a field ("pt", "inches", "seconds"…).
const Unit = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs text-muted-foreground">{children}</span>
);

// Amber notice box. Used for the liability/consent texts that must stay visible
// on the page rather than move into a tooltip — they are legal notices, not
// feature explanations.
function NoticeBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-700/60 dark:bg-amber-900/20">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {title}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/90">{children}</p>
    </div>
  );
}

// ─── Subscription display ──────────────────────────────────────────────────
// Plans are sold by how many fora they cover; the Early-Bird plans predate that
// and were priced by device count.
const PLAN_LABEL: Record<string, string> = {
  niche: "Niche — one court",
  dual: "Dual — two courts",
  max: "Max — every court",
  solo: "Early Bird — Solo",
  chamber: "Early Bird — Chamber",
  enterprise: "Early Bird — Enterprise",
};

const planLabel = (plan: Plan): string =>
  (plan && PLAN_LABEL[plan]) || (plan ? String(plan) : "No plan on record");

// What the entitlement resolver concluded, in the customer's words.
const REASON_LABEL: Record<EntitlementReason, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  'active': { label: "Active", tone: 'ok' },
  'trial': { label: "Trial", tone: 'ok' },
  'override': { label: "Manual access", tone: 'ok' },
  'cancelled-period-remaining': { label: "Cancelled — runs to period end", tone: 'warn' },
  'grace-payment-failed': { label: "Payment failed — grace period", tone: 'warn' },
  'lapsed': { label: "Lapsed — read-only", tone: 'bad' },
  'payment-failed': { label: "Payment failed — read-only", tone: 'bad' },
  'no-subscription': { label: "No subscription — read-only", tone: 'bad' },
};

function EntitlementChip({ reason }: { reason: EntitlementReason }) {
  const meta = REASON_LABEL[reason] ?? { label: String(reason), tone: 'warn' as const };
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        meta.tone === 'ok'
          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          : meta.tone === 'warn'
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {meta.label}
    </span>
  );
}

// The terms every Mayur user accepts by switching it on.
const MayurTermsNote = () => (
  <NoticeBox title="Terms of use">
    By using Mayur AI, you agree that you are fully responsible for the content generated by Mayur AI, and shall
    hold neither the developer nor Quindoph Legal Solutions Pvt. Ltd. liable for any such content. You agree that
    nothing generated by Mayur AI shall be used or filed by you without independent vetting and verification. You
    further agree that Mayur is currently in its Beta/experimental phase and its outputs may be erratic, and also
    that it requires a pre-existing Claude CLI Installation and Claude Pro or Max Subscription.
  </NoticeBox>
);

// Shown with every signature setting. Deliberately left on the page rather than
// tucked into a tooltip — it is a liability notice, not a feature explanation.
const SignatureLiabilityNote = () => (
  <NoticeBox title="Important">
    Please note that Drafto merely assists you in collating the paperbook and electronically placing your
    signatures on it. The responsibility for the contents of the paperbook continues to rest with you, and we
    urge you to examine the paperbook comprehensively before it is filed.
  </NoticeBox>
);

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  // Subscription facts for the Support page (plan, status, covered courts).
  const {
    entitlement,
    loading: entLoading,
    refresh: refreshEntitlement,
    openManageSubscription,
  } = useEntitlement();
  const [open, setOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('interface');
  const [showAdvancedVolume, setShowAdvancedVolume] = useState(false);
  const [usageCounts, setUsageCounts] = useState<UsageCounts | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem("theme") || "light") : "light"
  );
  type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error' | 'dev';
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  // True only while the user has explicitly clicked "Check for Updates"
  const userCheckInProgress = useRef(false);
  // AI Plugin (Beta) prerequisite detection
  const [aiPrereq, setAiPrereq] = useState<AiPrerequisites | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  // One-click Claude Code install
  const [installOpen, setInstallOpen] = useState(false);
  const [showInstallConsent, setShowInstallConsent] = useState(false);
  const [installState, setInstallState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [settings, setSettings] = useState<SettingsData>({
    defaultDocxPath: "",
    defaultPdfPath: "",
    defaultDraftoPath: "",
    uiFont: DEFAULT_UI_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    inputFont: DEFAULT_INPUT_FONT,
    inputFontSize: DEFAULT_INPUT_FONT_SIZE,
    annexureLabelBackground: false,
    annexureLabelSize: 14,
    annexureLabelMarginPt: 14.4,
    pageNumberSizePt: 20,
    pageNumberMarginTopPt: 54,
    pageNumberMarginRightPt: 54,
    trueCopyMarginXPt: 36,
    trueCopyMarginBottomPt: 36,
    checklistFontSizePt: 14,
    checklistLineSpacing: 1.5,
    checklistParaSpacingPt: 6,
    checklistMarginTopInches: 1,
    checklistMarginLeftInches: 1,
    exportHighlight: false,
    autosaveInterval: 60,
    toastDuration: 1,
    slpTabView: 'splitter',
    quoteLineSpacing: 'default',
    volumeSplitThreshold: 400,
    volumeStepSize: 200,
    maxComponentSplitPages: 50,
    minVolumeTailPages: 20,
    minVolumeHeadPages: 20,
    separateVolumePdfs: true,
    aorSignaturePng: "",
    aorSignatureW: 0,
    aorSignatureH: 0,
    placeSignatureInPaperbook: false,
    placeTrueCopyText: false,
    signatureSizePx: 120,
    trueCopyPosition: 'left',
    trueCopyBackground: false,
    outputFont: 'Times New Roman',
    outputFontSizePt: 14,
    outputLineSpacing: 1.5,
    outputParaAfterPt: 12,
    slpHeaderStyle: 'short',
    slpHeadingBreak: false,
    slpTranslatedCopyFirst: false,
    wpFactsFromLod: true,
    oaFactsFromLod: true,
    aiPluginEnabled: false,
    aiClaudeBinaryPath: "",
    aiModel: 'default',
    defaultAorName: "",
    defaultAorCode: "",
    wpNumbering: DEFAULT_WP_NUMBERING,
    wpFiledBy: DEFAULT_WP_FILED_BY,
    wpSignaturePng: "",
    wpSignatureW: 0,
    wpSignatureH: 0,
    wpPlaceSignatureInPaperbook: false,
    wpSignatureSizePx: 120,
    slpMarginTopIn: 1.5,
    slpMarginRightIn: 1,
    slpMarginBottomIn: 1,
    slpMarginLeftIn: 1.5,
    wpMarginTopIn: 1.5,
    wpMarginRightIn: 1,
    wpMarginBottomIn: 1,
    wpMarginLeftIn: 1.5,
    wpOutputFont: 'Times New Roman',
    wpOutputFontSizePt: 14,
    wpOutputLineSpacing: 1.5,
    wpOutputParaBeforePt: 0,
    wpOutputParaAfterPt: 12,
    wpFiledByLeftPct: 40,
    wpFiledByLayout: normalizeWpFiledByLayout(null),
    wpStampFont: 'times',
    wpPageNumberSizePt: 20,
    wpPageNumberMarginTopPt: 54,
    wpPageNumberMarginRightPt: 54,
    wpAnnexureLabelSizePt: 14,
    wpAnnexureLabelMarginPt: 14.4,
    wpAnnexureLabelPosition: 'center',
    wpStampBackground: false,
    wpPlaceTrueCopyText: false,
    wpTrueCopyPosition: 'left',
    wpTrueCopyBackground: false,
    wpTrueCopyMarginXPt: 36,
    wpTrueCopyMarginBottomPt: 36,
    oaBench: DEFAULT_OA_BENCH,
    oaFiledBy: DEFAULT_WP_FILED_BY,
    oaFiledByLeftPct: 40,
    oaFiledByLayout: normalizeWpFiledByLayout(null),
    oaSignaturePng: "",
    oaSignatureW: 0,
    oaSignatureH: 0,
    oaPlaceSignatureInPaperbook: false,
    oaSignatureSizePx: 120,
    oaStampFont: 'times',
    oaPageNumberSizePt: 20,
    oaPageNumberMarginTopPt: 54,
    oaPageNumberMarginRightPt: 54,
    oaAnnexureLabelSizePt: 14,
    oaAnnexureLabelMarginPt: 14.4,
    oaAnnexureLabelPosition: 'center',
    oaStampBackground: false,
    oaPlaceTrueCopyText: false,
    oaTrueCopyPosition: 'left',
    oaTrueCopyBackground: false,
    oaTrueCopyMarginXPt: 36,
    oaTrueCopyMarginBottomPt: 36,
    oaMarginTopIn: 1.5,
    oaMarginRightIn: 1,
    oaMarginBottomIn: 1,
    oaMarginLeftIn: 1.5,
    oaOutputFont: 'Times New Roman',
    oaOutputFontSizePt: 14,
    oaOutputLineSpacing: 1.5,
    oaOutputParaBeforePt: 0,
    oaOutputParaAfterPt: 12,
    oaVakFontSizePt: 11,
    oaVakLineSpacing: 1,
    oaVakParaSpacingPt: 4,
    wpVakFontSizePt: 11,
    wpVakLineSpacing: 1,
    wpVakParaSpacingPt: 4,
    oaForceLastPageBreak: true,
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({
          defaultDocxPath: parsed.defaultDocxPath || "",
          defaultPdfPath: parsed.defaultPdfPath || "",
          defaultDraftoPath: parsed.defaultDraftoPath || "",
          uiFont: parsed.uiFont || DEFAULT_UI_FONT,
          uiFontSize: parsed.uiFontSize ?? DEFAULT_UI_FONT_SIZE,
          inputFont: parsed.inputFont || DEFAULT_INPUT_FONT,
          inputFontSize: parsed.inputFontSize ?? DEFAULT_INPUT_FONT_SIZE,
          annexureLabelBackground: parsed.annexureLabelBackground ?? false,
          annexureLabelSize: parsed.annexureLabelSize ?? 14,
          annexureLabelMarginPt: parsed.annexureLabelMarginPt ?? 14.4,
          pageNumberSizePt: parsed.pageNumberSizePt ?? 20,
          pageNumberMarginTopPt: parsed.pageNumberMarginTopPt ?? 54,
          pageNumberMarginRightPt: parsed.pageNumberMarginRightPt ?? 54,
          trueCopyMarginXPt: parsed.trueCopyMarginXPt ?? 36,
          trueCopyMarginBottomPt: parsed.trueCopyMarginBottomPt ?? 36,
          checklistFontSizePt: parsed.checklistFontSizePt ?? 14,
          checklistLineSpacing: parsed.checklistLineSpacing ?? 1.5,
          checklistParaSpacingPt: parsed.checklistParaSpacingPt ?? 6,
          checklistMarginTopInches: parsed.checklistMarginTopInches ?? 1,
          checklistMarginLeftInches: parsed.checklistMarginLeftInches ?? 1,
          exportHighlight: parsed.exportHighlight ?? false,
          autosaveInterval: parsed.autosaveInterval ?? 60,
          toastDuration: parsed.toastDuration ?? 1,
          slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
          quoteLineSpacing: (parsed.quoteLineSpacing || 'default') as QuoteLineSpacing,
          volumeSplitThreshold: parsed.volumeSplitThreshold ?? 400,
          volumeStepSize: parsed.volumeStepSize ?? 200,
          maxComponentSplitPages: parsed.maxComponentSplitPages ?? 50,
          minVolumeTailPages: parsed.minVolumeTailPages ?? 20,
          minVolumeHeadPages: parsed.minVolumeHeadPages ?? 20,
          separateVolumePdfs: parsed.separateVolumePdfs ?? true,
          aorSignaturePng: parsed.aorSignaturePng ?? "",
          aorSignatureW: parsed.aorSignatureW ?? 0,
          aorSignatureH: parsed.aorSignatureH ?? 0,
          placeSignatureInPaperbook: parsed.placeSignatureInPaperbook ?? false,
          placeTrueCopyText: parsed.placeTrueCopyText ?? false,
          signatureSizePx: parsed.signatureSizePx ?? 120,
          trueCopyPosition: (parsed.trueCopyPosition || 'left') as TrueCopyPosition,
          trueCopyBackground: parsed.trueCopyBackground ?? false,
          outputFont: parsed.outputFont || 'Times New Roman',
          outputFontSizePt: parsed.outputFontSizePt ?? 14,
          outputLineSpacing: parsed.outputLineSpacing ?? 1.5,
          outputParaAfterPt: parsed.outputParaAfterPt ?? 12,
          slpHeaderStyle: (parsed.slpHeaderStyle === 'sci' ? 'sci' : 'short') as SlpHeaderStyle,
          slpHeadingBreak: parsed.slpHeadingBreak ?? false,
          slpTranslatedCopyFirst: parsed.slpTranslatedCopyFirst ?? false,
          wpFactsFromLod: parsed.wpFactsFromLod ?? true,
          oaFactsFromLod: parsed.oaFactsFromLod ?? true,
          aiPluginEnabled: parsed.aiPluginEnabled ?? false,
          aiClaudeBinaryPath: parsed.aiClaudeBinaryPath ?? "",
          aiModel: (parsed.aiModel || 'default') as AiModel,
          defaultAorName: parsed.defaultAorName ?? "",
          defaultAorCode: parsed.defaultAorCode ?? "",
          wpNumbering: {
            facts: parsed.wpNumbering?.facts ?? DEFAULT_WP_NUMBERING.facts,
            grounds: parsed.wpNumbering?.grounds ?? DEFAULT_WP_NUMBERING.grounds,
            prayers: parsed.wpNumbering?.prayers ?? DEFAULT_WP_NUMBERING.prayers,
          },
          wpFiledBy: {
            name: parsed.wpFiledBy?.name ?? "",
            firm: parsed.wpFiledBy?.firm ?? "",
            address: parsed.wpFiledBy?.address ?? "",
            enrolmentNo: parsed.wpFiledBy?.enrolmentNo ?? "",
            email: parsed.wpFiledBy?.email ?? "",
            phone: parsed.wpFiledBy?.phone ?? "",
          },
          wpSignaturePng: parsed.wpSignaturePng ?? "",
          wpSignatureW: parsed.wpSignatureW ?? 0,
          wpSignatureH: parsed.wpSignatureH ?? 0,
          wpPlaceSignatureInPaperbook: parsed.wpPlaceSignatureInPaperbook ?? false,
          wpSignatureSizePx: parsed.wpSignatureSizePx ?? 120,
          slpMarginTopIn: parsed.slpMarginTopIn ?? 1.5,
          slpMarginRightIn: parsed.slpMarginRightIn ?? 1,
          slpMarginBottomIn: parsed.slpMarginBottomIn ?? 1,
          slpMarginLeftIn: parsed.slpMarginLeftIn ?? 1.5,
          wpMarginTopIn: parsed.wpMarginTopIn ?? 1.5,
          wpMarginRightIn: parsed.wpMarginRightIn ?? 1,
          wpMarginBottomIn: parsed.wpMarginBottomIn ?? 1,
          wpMarginLeftIn: parsed.wpMarginLeftIn ?? 1.5,
          wpOutputFont: parsed.wpOutputFont || 'Times New Roman',
          wpOutputFontSizePt: parsed.wpOutputFontSizePt ?? 14,
          wpOutputLineSpacing: parsed.wpOutputLineSpacing ?? 1.5,
          wpOutputParaBeforePt: parsed.wpOutputParaBeforePt ?? 0,
          wpOutputParaAfterPt: parsed.wpOutputParaAfterPt ?? 12,
          wpFiledByLeftPct: parsed.wpFiledByLeftPct ?? 40,
          wpFiledByLayout: normalizeWpFiledByLayout(parsed.wpFiledByLayout),
          wpStampFont: ['times', 'helvetica', 'courier'].includes(parsed.wpStampFont) ? parsed.wpStampFont : 'times',
          wpPageNumberSizePt: parsed.wpPageNumberSizePt ?? 20,
          wpPageNumberMarginTopPt: parsed.wpPageNumberMarginTopPt ?? 54,
          wpPageNumberMarginRightPt: parsed.wpPageNumberMarginRightPt ?? 54,
          wpAnnexureLabelSizePt: parsed.wpAnnexureLabelSizePt ?? 14,
          wpAnnexureLabelMarginPt: parsed.wpAnnexureLabelMarginPt ?? 14.4,
          wpAnnexureLabelPosition: parsed.wpAnnexureLabelPosition === 'right' ? 'right' : 'center',
          wpStampBackground: parsed.wpStampBackground ?? false,
          wpPlaceTrueCopyText: parsed.wpPlaceTrueCopyText ?? false,
          wpTrueCopyPosition: parsed.wpTrueCopyPosition === 'center' ? 'center' : 'left',
          wpTrueCopyBackground: parsed.wpTrueCopyBackground ?? false,
          wpTrueCopyMarginXPt: parsed.wpTrueCopyMarginXPt ?? 36,
          wpTrueCopyMarginBottomPt: parsed.wpTrueCopyMarginBottomPt ?? 36,
          oaBench: parsed.oaBench || DEFAULT_OA_BENCH,
          oaFiledBy: {
            name: parsed.oaFiledBy?.name ?? "",
            firm: parsed.oaFiledBy?.firm ?? "",
            address: parsed.oaFiledBy?.address ?? "",
            enrolmentNo: parsed.oaFiledBy?.enrolmentNo ?? "",
            email: parsed.oaFiledBy?.email ?? "",
            phone: parsed.oaFiledBy?.phone ?? "",
          },
          oaFiledByLeftPct: parsed.oaFiledByLeftPct ?? 40,
          oaFiledByLayout: normalizeWpFiledByLayout(parsed.oaFiledByLayout),
          oaSignaturePng: parsed.oaSignaturePng ?? "",
          oaSignatureW: parsed.oaSignatureW ?? 0,
          oaSignatureH: parsed.oaSignatureH ?? 0,
          oaPlaceSignatureInPaperbook: parsed.oaPlaceSignatureInPaperbook ?? false,
          oaSignatureSizePx: parsed.oaSignatureSizePx ?? 120,
          oaStampFont: ['times', 'helvetica', 'courier'].includes(parsed.oaStampFont) ? parsed.oaStampFont : 'times',
          oaPageNumberSizePt: parsed.oaPageNumberSizePt ?? 20,
          oaPageNumberMarginTopPt: parsed.oaPageNumberMarginTopPt ?? 54,
          oaPageNumberMarginRightPt: parsed.oaPageNumberMarginRightPt ?? 54,
          oaAnnexureLabelSizePt: parsed.oaAnnexureLabelSizePt ?? 14,
          oaAnnexureLabelMarginPt: parsed.oaAnnexureLabelMarginPt ?? 14.4,
          oaAnnexureLabelPosition: (parsed.oaAnnexureLabelPosition === 'right' ? 'right' : 'center'),
          oaStampBackground: parsed.oaStampBackground ?? false,
          oaPlaceTrueCopyText: parsed.oaPlaceTrueCopyText ?? false,
          oaTrueCopyPosition: (parsed.oaTrueCopyPosition === 'center' ? 'center' : 'left'),
          oaTrueCopyBackground: parsed.oaTrueCopyBackground ?? false,
          oaTrueCopyMarginXPt: parsed.oaTrueCopyMarginXPt ?? 36,
          oaTrueCopyMarginBottomPt: parsed.oaTrueCopyMarginBottomPt ?? 36,
          oaMarginTopIn: parsed.oaMarginTopIn ?? 1.5,
          oaMarginRightIn: parsed.oaMarginRightIn ?? 1,
          oaMarginBottomIn: parsed.oaMarginBottomIn ?? 1,
          oaMarginLeftIn: parsed.oaMarginLeftIn ?? 1.5,
          oaOutputFont: parsed.oaOutputFont || 'Times New Roman',
          oaOutputFontSizePt: parsed.oaOutputFontSizePt ?? 14,
          oaOutputLineSpacing: parsed.oaOutputLineSpacing ?? 1.5,
          oaOutputParaBeforePt: parsed.oaOutputParaBeforePt ?? 0,
          oaOutputParaAfterPt: parsed.oaOutputParaAfterPt ?? 12,
          oaVakFontSizePt: parsed.oaVakFontSizePt ?? 11,
          oaVakLineSpacing: parsed.oaVakLineSpacing ?? 1,
          oaVakParaSpacingPt: parsed.oaVakParaSpacingPt ?? 4,
          wpVakFontSizePt: parsed.wpVakFontSizePt ?? 11,
          wpVakLineSpacing: parsed.wpVakLineSpacing ?? 1,
          wpVakParaSpacingPt: parsed.wpVakParaSpacingPt ?? 4,
          oaForceLastPageBreak: parsed.oaForceLastPageBreak ?? true,
        });
        applyUiFont(parsed.uiFont || DEFAULT_UI_FONT);
        applyUiFontSize(parsed.uiFontSize ?? DEFAULT_UI_FONT_SIZE);
        applyInputFont(parsed.inputFont || DEFAULT_INPUT_FONT);
        applyInputFontSize(parsed.inputFontSize ?? DEFAULT_INPUT_FONT_SIZE);
      } catch (err) {
        console.error("Failed to parse settings:", err);
      }
    }
  }, []);

  // Apply theme immediately when toggled
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [theme]);

  // Fetch usage counts when dialog opens
  useEffect(() => {
    if (open) {
      getGenerationCounts().then(setUsageCounts);
    }
  }, [open]);

  // Register auto-update event listeners
  useEffect(() => {
    if (!window.electron) return;
    window.electron.onAuUpdateAvailable?.((info: { version: string }) => {
      userCheckInProgress.current = false;
      setUpdateVersion(info.version);
      setUpdateStatus('available');
    });
    window.electron.onAuUpdateNotAvailable?.(() => {
      // Only surface "up-to-date" if the user explicitly asked
      if (userCheckInProgress.current) {
        setUpdateStatus('up-to-date');
      }
      userCheckInProgress.current = false;
    });
    window.electron.onAuDownloadProgress?.((prog: { percent: number }) => {
      setDownloadPercent(Math.round(prog.percent));
      setUpdateStatus('downloading');
    });
    window.electron.onAuUpdateDownloaded?.(() => {
      setUpdateStatus('downloaded');
    });
    window.electron.onAuError?.(() => {
      // Silently ignore background startup errors; only show error for user-initiated checks
      if (userCheckInProgress.current) {
        setUpdateStatus('error');
        userCheckInProgress.current = false;
      }
    });
  }, []);

  // Snapshot of the persisted state captured when the dialog opens, so Cancel
  // (button, Escape, or clicking outside) can fully discard unsaved edits —
  // including the ones that were applied live (fonts, theme).
  const openSnapshotRef = useRef<{ settings: SettingsData; theme: string } | null>(null);

  const revertUnsaved = () => {
    const snap = openSnapshotRef.current;
    if (!snap) return;
    setSettings(snap.settings);
    setTheme(snap.theme); // its effect re-applies the class AND rewrites localStorage('theme')
    applyUiFont(snap.settings.uiFont);
    applyUiFontSize(snap.settings.uiFontSize);
    applyInputFont(snap.settings.inputFont);
    applyInputFontSize(snap.settings.inputFontSize);
  };

  // Snapshot on open; discard-and-revert on any close that isn't a Save.
  const handleOpenChange = (o: boolean) => {
    if (o) openSnapshotRef.current = { settings, theme };
    else revertUnsaved();
    setOpen(o);
  };

  const handleSave = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('drafto-settings-changed'));
    applyUiFont(settings.uiFont);
    applyUiFontSize(settings.uiFontSize);
    applyInputFont(settings.inputFont);
    applyInputFontSize(settings.inputFontSize);
    toast({ title: "Settings Saved", description: "Your settings have been updated." });
    setOpen(false);
  };

  // Reset the Appearance settings (theme, text size, fonts) to their defaults and
  // apply them live. Other settings are untouched; Save still persists.
  const restoreAppearanceDefaults = () => {
    setTheme(APPEARANCE_DEFAULTS.theme);
    setSettings((prev) => ({
      ...prev,
      uiFont: APPEARANCE_DEFAULTS.uiFont,
      uiFontSize: APPEARANCE_DEFAULTS.uiFontSize,
      inputFont: APPEARANCE_DEFAULTS.inputFont,
      inputFontSize: APPEARANCE_DEFAULTS.inputFontSize,
    }));
    applyUiFont(APPEARANCE_DEFAULTS.uiFont);
    applyUiFontSize(APPEARANCE_DEFAULTS.uiFontSize);
    applyInputFont(APPEARANCE_DEFAULTS.inputFont);
    applyInputFontSize(APPEARANCE_DEFAULTS.inputFontSize);
  };

  const handleBrowse = async (type: "docx" | "pdf" | "drafto") => {
    if (window.electron?.selectDirectory) {
      try {
        const selectedPath = await window.electron.selectDirectory();
        if (selectedPath) {
          const keyMap: Record<typeof type, keyof SettingsData> = {
            docx: "defaultDocxPath",
            pdf: "defaultPdfPath",
            drafto: "defaultDraftoPath",
          };
          setSettings((prev) => ({ ...prev, [keyMap[type]]: selectedPath }));
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Error",
          description: `Could not select directory: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "Not Available",
        description: "Directory selection is only available in the desktop app.",
      });
    }
  };

  const signatureInputRef = useRef<HTMLInputElement>(null);
  const wpSignatureInputRef = useRef<HTMLInputElement>(null);
  const oaSignatureInputRef = useRef<HTMLInputElement>(null);

  // Shared PNG-upload flow for every signature slot (SLP AoR / WP / CAT advocate).
  const readSignaturePng = (
    e: React.ChangeEvent<HTMLInputElement>,
    apply: (dataUrl: string, w: number, h: number) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") {
      toast({ variant: "destructive", title: "PNG required", description: "Please upload a .png signature image." });
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onload = () => apply(dataUrl, img.naturalWidth, img.naturalHeight);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
    readSignaturePng(e, (dataUrl, w, h) => setSettings((prev) => ({ ...prev, aorSignaturePng: dataUrl, aorSignatureW: w, aorSignatureH: h })));

  const handleWpSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
    readSignaturePng(e, (dataUrl, w, h) => setSettings((prev) => ({ ...prev, wpSignaturePng: dataUrl, wpSignatureW: w, wpSignatureH: h })));

  const handleOaSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) =>
    readSignaturePng(e, (dataUrl, w, h) => setSettings((prev) => ({ ...prev, oaSignaturePng: dataUrl, oaSignatureW: w, oaSignatureH: h })));

  // Compact numeric field bound to a settings key. Clamps as the user types,
  // exactly as the individual inputs used to.
  const numField = (
    key: keyof SettingsData,
    o: { min: number; max?: number; step?: number; int?: boolean; width?: string; id?: string },
  ) => (
    <Input
      id={o.id}
      type="number"
      min={o.min}
      max={o.max}
      step={o.step ?? 1}
      value={settings[key] as number}
      onChange={(e) => {
        const raw = o.int ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
        const bounded = Number.isNaN(raw) ? o.min : Math.max(o.min, o.max === undefined ? raw : Math.min(o.max, raw));
        setSettings((prev) => ({ ...prev, [key]: bounded }));
      }}
      className={cn("h-7 text-xs", o.width ?? "w-20")}
    />
  );

  // Four page-margin inputs (inches), shared by the SLP, WP and OA pages.
  const marginInputs = (keys: { top: keyof SettingsData; right: keyof SettingsData; bottom: keyof SettingsData; left: keyof SettingsData }) => (
    <>
      {([["Top", keys.top], ["Right", keys.right], ["Bottom", keys.bottom], ["Left", keys.left]] as [string, keyof SettingsData][]).map(([label, key]) => (
        <React.Fragment key={key as string}>
          <Unit>{label}</Unit>
          {numField(key, { min: 0.2, max: 3, step: 0.1, width: "w-14" })}
        </React.Fragment>
      ))}
      <Unit>inches</Unit>
    </>
  );

  // Signature slot: preview, upload/replace, remove. Shared by all three
  // document types so they behave identically.
  const signatureSlot = (o: {
    png: string;
    inputRef: React.RefObject<HTMLInputElement>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
  }) => (
    <>
      <input ref={o.inputRef} type="file" accept="image/png" onChange={o.onUpload} className="hidden" />
      {o.png ? (
        <div className="flex items-center justify-center rounded border bg-white p-1" style={{ width: 84, height: 40 }}>
          <img src={o.png} alt="Signature" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div className="flex items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground" style={{ width: 84, height: 40 }}>
          None
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => o.inputRef.current?.click()}>
        {o.png ? "Replace" : "Upload"}
      </Button>
      {o.png && (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={o.onRemove}>
          Remove
        </Button>
      )}
    </>
  );

  // Advocate-details designer (order, "| next" joins, per-item styling), shared
  // by the WP and OA "Filed by" blocks.
  const filedByDesigner = (layout: WpFiledByLayoutItem[], apply: (next: WpFiledByLayoutItem[]) => void) => (
    <div className="space-y-1">
      {layout.map((item, i, arr) => {
        const update = (patch: Partial<WpFiledByLayoutItem>) =>
          apply(layout.map((it, j) => (j === i ? { ...it, ...patch } : it)));
        const move = (dir: -1 | 1) => {
          const a = [...layout];
          const t = i + dir;
          if (t < 0 || t >= a.length) return;
          [a[i], a[t]] = [a[t], a[i]];
          apply(a);
        };
        const fmtBtn = (label: string, active: boolean, onClick: () => void, cls = "") => (
          <button
            type="button"
            onClick={onClick}
            className={`h-6 w-6 rounded border text-[11px] leading-none ${cls} ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        );
        return (
          <div key={item.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
            <span className="flex flex-col">
              <button type="button" disabled={i === 0} onClick={() => move(-1)} className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ArrowUp className="h-3 w-3" /></button>
              <button type="button" disabled={i === arr.length - 1} onClick={() => move(1)} className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ArrowDown className="h-3 w-3" /></button>
            </span>
            <span className="flex-grow text-xs">{WP_FILED_BY_ITEM_LABELS[item.id]}</span>
            {fmtBtn("B", item.bold, () => update({ bold: !item.bold }), "font-bold")}
            {fmtBtn("I", item.italics, () => update({ italics: !item.italics }), "italic")}
            {fmtBtn("U", item.underline, () => update({ underline: !item.underline }), "underline")}
            <Select value={item.caps} onValueChange={(v) => update({ caps: v as WpFiledByCaps })}>
              <SelectTrigger className="h-6 w-[92px] px-1.5 text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Normal</SelectItem>
                <SelectItem value="allCaps" className="text-xs">ALL CAPS</SelectItem>
                <SelectItem value="smallCaps" className="text-xs" style={{ fontVariant: 'small-caps' }}>Small Caps</SelectItem>
              </SelectContent>
            </Select>
            {i < arr.length - 1 ? (
              <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={item.joinWithNext}
                  onChange={(e) => update({ joinWithNext: e.target.checked })}
                  className="h-3 w-3 rounded border-gray-300"
                />
                <span className="font-mono">| next</span>
              </label>
            ) : (
              <span className="w-[52px]" />
            )}
          </div>
        );
      })}
    </div>
  );

  // Docx-approximating preview of the "Filed by" block, shared by WP and OA.
  // The box maps the docx content width (A4 8.27" less the configured left/right
  // margins) onto a fixed pixel width.
  const filedByPreview = (o: {
    leftPct: number;
    layout: WpFiledByLayoutItem[];
    filedBy: WpFiledBy;
    signaturePng: string;
    signatureW: number;
    signatureH: number;
    signatureSizePx: number;
    placeSignature: boolean;
    font: string;
    fontSizePt: number;
    marginLeftIn: number;
    marginRightIn: number;
  }) => {
    const contentIn = Math.max(3, 8.27 - o.marginLeftIn - o.marginRightIn);
    const boxPx = 430;
    const pxPerIn = boxPx / contentIn;
    const fontPx = Math.max(6, (o.fontSizePt / 72) * pxPerIn);
    const showSig = !!o.signaturePng && o.placeSignature && o.signatureW > 0;
    const sigW = showSig ? (o.signatureSizePx / 96) * pxPerIn : 0;
    const sigH = showSig ? sigW * (o.signatureH / o.signatureW) : 0;
    const overlapPx = (6 / 72) * pxPerIn; // signature dips 6pt into the name line
    const fb = o.filedBy;
    // Empty fields show greyed placeholders so the layout can be designed before
    // the defaults are filled in.
    const realVals = {
      firm: fb.firm || "", address: fb.address || "",
      enrolmentNo: fb.enrolmentNo ? `Enrl. No.: ${fb.enrolmentNo}` : "",
      email: fb.email || "", phone: fb.phone || "",
    };
    const placeholders = { firm: "[Firm]", address: "[Address]", enrolmentNo: "Enrl. No.: [xx/xxxx]", email: "[email]", phone: "[phone]" };
    const previewVals = Object.fromEntries(
      (Object.keys(realVals) as (keyof typeof realVals)[]).map((k) => [k, realVals[k] || placeholders[k]])
    ) as typeof realVals;
    const fbLines = wpFiledByLines(o.layout, previewVals);
    const partStyle = (it: WpFiledByLayoutItem, isPlaceholder: boolean): React.CSSProperties => ({
      fontWeight: it.bold ? 700 : 400,
      fontStyle: it.italics ? 'italic' : 'normal',
      textDecoration: it.underline ? 'underline' : 'none',
      textTransform: it.caps === 'allCaps' ? 'uppercase' : 'none',
      fontVariant: it.caps === 'smallCaps' ? 'small-caps' : 'normal',
      opacity: isPlaceholder ? 0.45 : 1,
    });
    return (
      <div className="overflow-hidden rounded border bg-white p-2 text-black" style={{ width: boxPx + 18, fontFamily: o.font, fontSize: fontPx, lineHeight: 1.25 }}>
        <div className="flex" style={{ width: boxPx }}>
          <div style={{ width: `${o.leftPct}%`, flexShrink: 0 }}>
            <div>Filed on: __.__.____</div>
            <div>Place: New Delhi</div>
          </div>
          <div style={{ width: `${100 - o.leftPct}%`, flexShrink: 0, minWidth: 0 }}>
            <div>Filed by:</div>
            <div style={{ position: 'relative', marginTop: showSig ? Math.max(4, sigH - overlapPx) : fontPx * 0.6 }}>
              {showSig && (
                <img src={o.signaturePng} alt="signature" style={{ position: 'absolute', left: 0, bottom: fontPx * 1.1 - overlapPx, width: sigW, height: sigH }} />
              )}
              <div style={{ fontWeight: 700 }}>{fb.name || "[Advocate name]"}</div>
            </div>
            {fbLines.map((line, li) => (
              <div key={li} style={{ whiteSpace: 'pre-line' }}>
                {line.map((part, pi) => (
                  <React.Fragment key={part.item.id}>
                    {pi > 0 && <span> | </span>}
                    <span style={partStyle(part.item, !realVals[part.item.id])}>{part.text}</span>
                  </React.Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // The five one-line "Filed by" defaults plus the address box, shared by WP and OA.
  const filedByFields = (filedBy: WpFiledBy, apply: (patch: Partial<WpFiledBy>) => void) => (
    <>
      {([
        ["name", "Advocate name"],
        ["firm", "Firm / Chamber"],
        ["enrolmentNo", "Enrolment No."],
        ["phone", "Phone"],
        ["email", "Email"],
      ] as [keyof WpFiledBy, string][]).map(([key, label]) => (
        <SettingRow key={String(key)} label={label}>
          <Input
            className="h-7 max-w-[280px] text-xs"
            value={filedBy?.[key] ?? ""}
            onChange={(e) => apply({ [key]: e.target.value } as Partial<WpFiledBy>)}
          />
        </SettingRow>
      ))}
      <SettingRow label="Address">
        <Textarea
          rows={2}
          className="max-w-[280px] text-xs"
          value={filedBy?.address ?? ""}
          onChange={(e) => apply({ address: e.target.value })}
        />
      </SettingRow>
    </>
  );

  const handleUpdate = async () => {
    if (!window.electron?.auCheck) return;
    userCheckInProgress.current = true;
    setUpdateStatus('checking');
    const result = await window.electron.auCheck();
    if (result?.status === 'dev') { userCheckInProgress.current = false; setUpdateStatus('dev'); }
    else if (result?.status === 'error') { userCheckInProgress.current = false; setUpdateStatus('error'); }
    // Otherwise wait for au-update-available / au-update-not-available events
  };

  const handleDownload = () => {
    window.electron?.auDownload?.();
    setUpdateStatus('downloading');
    setDownloadPercent(0);
  };

  const handleInstall = () => {
    window.electron?.auInstall?.();
  };

  // Detects the CLI and (via `claude auth status`) whether it's signed in. Both
  // are free + instant, so this runs automatically when the tab opens.
  const checkAiPrereqs = async () => {
    if (!window.electron?.aiCheckPrerequisites) {
      toast({ variant: "destructive", title: "Not available", description: "Mayur is only available in the desktop app." });
      return;
    }
    setAiChecking(true);
    try {
      const result = await window.electron.aiCheckPrerequisites({ customClaudePath: settings.aiClaudeBinaryPath });
      setAiPrereq(result);
    } catch (err) {
      toast({ variant: "destructive", title: "Check failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setAiChecking(false);
    }
  };

  // Opens a Terminal running `claude auth login` so the user can sign in without
  // typing any commands. They click "Re-check" afterwards to confirm.
  const handleAiLogin = async () => {
    if (!window.electron?.aiLogin) {
      toast({ variant: "destructive", title: "Not available", description: "Sign-in is only available in the desktop app." });
      return;
    }
    const r = await window.electron.aiLogin({ claudePath: settings.aiClaudeBinaryPath });
    if (r?.ok) {
      toast({ title: "Terminal opened", description: "Finish signing in there (your browser will open), then click Re-check." });
    } else {
      toast({ variant: "destructive", title: "Couldn't open Terminal", description: r?.error || "Use the manual steps below." });
    }
  };

  // One-click install of the Claude Code CLI (after the user confirms consent).
  // Streams the installer's output, then re-checks prerequisites and — on success
  // — auto-launches the sign-in flow.
  const runInstallClaude = async () => {
    if (!window.electron?.aiInstallClaude) {
      toast({ variant: "destructive", title: "Not available", description: "Install is only available in the desktop app." });
      return;
    }
    setInstallState('running');
    setInstallLog([]);
    const dispose = window.electron.onAiInstallLog?.((line) => setInstallLog((prev) => [...prev, line]));
    try {
      const r = await window.electron.aiInstallClaude();
      setInstallState(r?.ok ? 'done' : 'error');
      const result = await window.electron.aiCheckPrerequisites?.({ customClaudePath: settings.aiClaudeBinaryPath });
      if (result) setAiPrereq(result);
      if (r?.ok && result?.claude?.found) {
        // Installed successfully but not yet signed in → kick off sign-in.
        if (result.loggedIn !== true) {
          toast({ title: "Claude Code installed", description: "Opening sign-in — approve it in your browser, then click Re-check." });
          await handleAiLogin();
        } else {
          toast({ title: "Claude Code is ready", description: "Installed and already signed in." });
        }
      } else if (!r?.ok) {
        toast({ variant: "destructive", title: "Install failed", description: r?.error || "See the log. You can also use the manual steps below." });
      }
    } catch (err) {
      setInstallState('error');
      toast({ variant: "destructive", title: "Install failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      dispose?.();
    }
  };

  const handleRelaunch = () => {
    window.electron?.relaunchApp?.();
  };

  // Auto-run the check the first time the Customize tab is opened while the
  // plugin is enabled, so the status (incl. login) reflects reality with no click.
  useEffect(() => {
    if (open && selectedSection === 'customize' && settings.aiPluginEnabled && aiPrereq === null && !aiChecking) {
      checkAiPrereqs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedSection, settings.aiPluginEnabled]);

  const handleReachOut = () => {
    const url = "https://drafto.quindoph.com/support";
    if (window.electron?.openExternal) {
      window.electron.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl flex flex-col" style={{ height: 'min(520px, calc(100vh - 4rem))' }}>
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {/* Split layout */}
        <div className="flex flex-1 min-h-0 rounded-lg border overflow-hidden">
          {/* Left nav */}
          <div className="w-36 shrink-0 border-r flex flex-col p-2 space-y-0.5 bg-muted/30">
            {/* Common to all court & document types */}
            <SettingsNavRow label="Interface" selected={selectedSection === 'interface'} onClick={() => setSelectedSection('interface')} />
            <SettingsNavRow label="Mayur (AI)" selected={selectedSection === 'customize'} onClick={() => setSelectedSection('customize')} />
            <SettingsNavRow label="Save Locations" selected={selectedSection === 'save'} onClick={() => setSelectedSection('save')} />

            {/* Per document type */}
            <div className="my-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Document types</div>
            <SettingsNavRow label="Special Leave Petition" tag="SC" selected={selectedSection === 'slp'} onClick={() => setSelectedSection('slp')} />
            <SettingsNavRow label="Writ Petition" tag="HC" selected={selectedSection === 'wp'} onClick={() => setSelectedSection('wp')} />
            <SettingsNavRow label="Original Application" tag="CAT" selected={selectedSection === 'oa'} onClick={() => setSelectedSection('oa')} />

            <div className="my-1 border-t" />
            <SettingsNavRow label="Shortcuts" selected={selectedSection === 'shortcuts'} onClick={() => setSelectedSection('shortcuts')} />
            <SettingsNavRow label="Support" selected={selectedSection === 'support'} onClick={() => setSelectedSection('support')} />
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── INTERFACE ── */}
            {selectedSection === 'interface' && (
              <div className="space-y-1">
                <SettingRow label="Mode">
                  <SegGroup
                    value={theme}
                    onChange={(v) => setTheme(v)}
                    options={[
                      { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
                      { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
                    ]}
                  />
                </SettingRow>

                <SettingRow
                  label="Interface Font"
                  info="Font and text size used across Drafto's own interface. Does not affect the generated document."
                >
                  <Select
                    value={settings.uiFont}
                    onValueChange={(value) => { setSettings((prev) => ({ ...prev, uiFont: value })); applyUiFont(value); }}
                  >
                    <SelectTrigger className="h-7 w-[190px] text-xs" style={{ fontFamily: settings.uiFont }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FONTS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(settings.uiFontSize)}
                    onValueChange={(value) => { const n = parseInt(value, 10); setSettings((prev) => ({ ...prev, uiFontSize: n })); applyUiFontSize(n); }}
                  >
                    <SelectTrigger className="h-7 w-[84px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UI_FONT_SIZES.map((s) => (<SelectItem key={s} value={String(s)} className="text-xs">{s} px</SelectItem>))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow
                  label="Editor Font"
                  info="Font and text size for the text you type — form fields and the rich-text editor. For the best view, keep this at or below the interface size. Does not affect the generated document."
                >
                  <Select
                    value={settings.inputFont}
                    onValueChange={(value) => { setSettings((prev) => ({ ...prev, inputFont: value })); applyInputFont(value); }}
                  >
                    <SelectTrigger className="h-7 w-[190px] text-xs" style={{ fontFamily: settings.inputFont }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FONTS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs" style={{ fontFamily: f.value }}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(settings.inputFontSize)}
                    onValueChange={(value) => { const n = parseInt(value, 10); setSettings((prev) => ({ ...prev, inputFontSize: n })); applyInputFontSize(n); }}
                  >
                    <SelectTrigger className="h-7 w-[84px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INPUT_FONT_SIZES.map((s) => (<SelectItem key={s} value={String(s)} className="text-xs">{s} px</SelectItem>))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow
                  label="Default Petition View"
                  info="Applied when a new project is created. The Split / Nav toggle in the toolbar switches views at any time."
                >
                  <SegGroup
                    value={settings.slpTabView}
                    onChange={(v: SlpTabView) => setSettings((prev) => ({ ...prev, slpTabView: v }))}
                    options={[
                      { value: 'splitter', label: 'Split' },
                      { value: 'navigation', label: 'Navigation' },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Notification Duration" htmlFor="toast-duration" info="How long pop-up messages stay on screen.">
                  <Input
                    id="toast-duration"
                    type="number"
                    min={1}
                    step={1}
                    value={settings.toastDuration}
                    onChange={(e) => setSettings((prev) => ({ ...prev, toastDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="h-7 w-16 text-right text-xs"
                  />
                  <Unit>seconds</Unit>
                </SettingRow>

                <SettingRow label="Autosave Duration" htmlFor="autosave-interval" info="How often the open project is saved automatically.">
                  <Input
                    id="autosave-interval"
                    type="number"
                    min={0}
                    step={10}
                    value={settings.autosaveInterval}
                    onChange={(e) => setSettings((prev) => ({ ...prev, autosaveInterval: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="h-7 w-16 text-right text-xs"
                  />
                  <Unit>seconds (0 = off)</Unit>
                </SettingRow>

                <SettingRow
                  label="Text Highlights"
                  info="Export: highlights applied in the editor are carried into the DOCX and PDF. Don't export: they stay on screen only."
                >
                  <SegGroup
                    value={settings.exportHighlight ? 'export' : 'keep'}
                    onChange={(v) => setSettings((prev) => ({ ...prev, exportHighlight: v === 'export' }))}
                    options={[
                      { value: 'export', label: 'Export' },
                      { value: 'keep', label: "Don't Export" },
                    ]}
                  />
                </SettingRow>

                <div className="flex items-center gap-2 pt-3">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={restoreAppearanceDefaults}>
                    Restore Defaults
                  </Button>
                  <InfoTip
                    about="Restore Defaults"
                    text="Resets Mode, Fonts and Sizes to Light, Arial, 16 px (interface) and 12 px (editor). Click Save to keep."
                  />
                </div>
              </div>
            )}

            {/* ── CUSTOMIZE ── */}
            {selectedSection === 'customize' && (
              <div className="space-y-4">
                <SettingsGroup
                  title="Mayur"
                  beta
                  icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
                  info={"Mayur is Drafto's drafting assistant. Drafto itself provides no AI — Mayur runs on your own Claude Code subscription and appears as a chat box at the bottom-right of Drafto. Talk to it, or point it at a folder of raw PDFs and ask it to help fill in your project.\n\nYour credentials never leave your machine: Drafto runs the `claude` command you already have installed. Neither Quindoph nor the developer is liable for any data you share with the Claude CLI through Mayur, and Drafto neither captures nor stores that data — it is processed by Claude alone.\n\nMayur can read files you point it to and suggest field values, but it will not overwrite your work without confirmation. Always review its suggestions before saving."}
                >
                  <CheckRow
                    id="ai-plugin-enabled"
                    checked={settings.aiPluginEnabled}
                    onChange={(v) => setSettings((prev) => ({ ...prev, aiPluginEnabled: v }))}
                    label="Enable Mayur (the chat box in Drafto)"
                  />
                  <MayurTermsNote />
                </SettingsGroup>

                {settings.aiPluginEnabled && (
                  <>
                    <SettingsGroup
                      title="Status"
                      info="Mayur needs the Claude Code CLI installed and signed in. Node.js is only needed for the npm install route."
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {aiPrereq === null && !aiChecking ? "Not checked yet." : "Prerequisites on this machine"}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[11px]"
                          onClick={checkAiPrereqs}
                          disabled={aiChecking}
                        >
                          {aiChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          {aiChecking ? "Checking…" : "Re-check"}
                        </Button>
                      </div>

                      {aiPrereq && (
                        <div className="space-y-1.5">
                          <PrereqRow
                            ok={aiPrereq.claude.found}
                            label="Claude Code CLI"
                            detail={aiPrereq.claude.found ? (aiPrereq.claude.version || "found") : "not found on PATH"}
                          />
                          <PrereqRow
                            ok={aiPrereq.node.found}
                            label="Node.js"
                            detail={aiPrereq.node.found ? (aiPrereq.node.version || "found") : "not found on PATH"}
                            warnOnly
                          />
                          {aiPrereq.claude.found && aiPrereq.loggedIn !== null && (
                            <PrereqRow
                              ok={aiPrereq.loggedIn === true}
                              label="Signed in"
                              detail={aiPrereq.loggedIn ? "authenticated" : "not signed in"}
                            />
                          )}

                          {!aiPrereq.claude.found ? (
                            <p className="flex items-center gap-1 pt-1 text-[11px] text-amber-700 dark:text-amber-300">
                              <AlertCircle className="h-3 w-3 shrink-0" /> Install Claude Code below, then Re-check.
                            </p>
                          ) : aiPrereq.loggedIn !== true ? (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={handleAiLogin}>
                                <Sparkles className="h-3.5 w-3.5" /> Sign in to Claude Code
                              </Button>
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={handleRelaunch}>
                                <RefreshCw className="h-3.5 w-3.5" /> Relaunch Drafto
                              </Button>
                              <InfoTip
                                about="signing in"
                                text={"Installed but not signed in. The button opens a Terminal and your browser to sign in — click it again if the browser didn't open last time.\n\nIf Mayur still shows as not ready afterwards, relaunch Drafto."}
                              />
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <p className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3 shrink-0" /> Ready — connected and signed in.
                              </p>
                              <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground" onClick={handleAiLogin}>
                                <Sparkles className="h-3 w-3" /> Sign in again
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </SettingsGroup>

                    <SettingsGroup
                      title="Model"
                      info={"Leave on Default and each task picks a sensible model automatically — Haiku for extraction (Memo, List of Dates), Sonnet for drafting (Grounds). Choosing one here overrides that for every task.\n\nA bigger model uses your Claude allowance faster, and Opus may require a Max plan."}
                    >
                      <SettingRow label="Model">
                        <Select
                          value={settings.aiModel}
                          onValueChange={(v: AiModel) => setSettings((prev) => ({ ...prev, aiModel: v }))}
                        >
                          <SelectTrigger className="h-7 w-[260px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-xs">Default (your CLI's model)</SelectItem>
                            <SelectItem value="haiku" className="text-xs">Haiku — fastest, lightest usage</SelectItem>
                            <SelectItem value="sonnet" className="text-xs">Sonnet — balanced (recommended)</SelectItem>
                            <SelectItem value="opus" className="text-xs">Opus — strongest, heaviest usage</SelectItem>
                          </SelectContent>
                        </Select>
                      </SettingRow>
                    </SettingsGroup>

                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setInstallOpen((v) => !v)}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground dark:text-slate-300"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", installOpen && "rotate-90")} />
                        Installation
                      </button>

                      {installOpen && (
                        <div className="space-y-3">
                          {/* One-click install */}
                          <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-medium text-foreground">Don't have Claude Code yet?</p>
                              <InfoTip
                                about="one-click install"
                                text={"Drafto downloads and runs Anthropic's official Claude Code installer (from claude.ai) on your computer. It installs the `claude` command in your user account — no admin rights — and needs an internet connection.\n\nAfterwards you sign in with your own Claude account (Pro/Max plan or API credits) in your browser. Your credentials never go to Drafto."}
                              />
                            </div>
                            {installState !== 'running' && !showInstallConsent && installState !== 'done' && (
                              <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setShowInstallConsent(true)}>
                                <Download className="h-3.5 w-3.5" /> Install Claude Code (one-click)
                              </Button>
                            )}
                            {showInstallConsent && installState !== 'running' && (
                              <div className="space-y-1.5">
                                <p className="text-[11px] leading-relaxed text-foreground">
                                  Drafto will download and run Anthropic's official installer, then open sign-in in your browser. Proceed?
                                </p>
                                <div className="flex gap-2">
                                  <Button type="button" size="sm" className="h-7 text-[11px]" onClick={() => { setShowInstallConsent(false); runInstallClaude(); }}>Yes, install</Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowInstallConsent(false)}>Cancel</Button>
                                </div>
                              </div>
                            )}
                            {installState === 'running' && (
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Installing Claude Code…</div>
                            )}
                            {installState === 'done' && (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
                                  <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Installed. Next: sign in, then relaunch Drafto.
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={handleAiLogin}>
                                    <Sparkles className="h-3.5 w-3.5" /> Sign in to Claude Code
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={handleRelaunch}>
                                    <RefreshCw className="h-3.5 w-3.5" /> Relaunch Drafto
                                  </Button>
                                </div>
                              </div>
                            )}
                            {installLog.length > 0 && (
                              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-1.5 text-[10px] leading-snug">{installLog.join("\n")}</pre>
                            )}
                          </div>

                          {/* Manual route */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">Prefer to do it yourself?</p>
                              <InfoTip
                                about="manual installation"
                                text={"Already use Claude Code? Skip step 1 — just make sure it is signed in.\n\nIf the npm install fails with a \"permission denied / EACCES\" error, use the curl installer instead; it avoids the system folder that causes that.\n\nSigning in through the Claude Desktop app does NOT count — the CLI needs its own sign-in, and an active Claude Pro/Max plan or API credits."}
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[11px] text-muted-foreground">1. Install the CLI:</p>
                              <code className="block select-all rounded bg-muted px-1.5 py-1 text-[11px]">curl -fsSL https://claude.ai/install.sh | bash</code>
                              <code className="block select-all rounded bg-muted px-1.5 py-1 text-[11px]">npm install -g @anthropic-ai/claude-code</code>
                              <p className="text-[11px] text-muted-foreground">2. Sign in (or use the button above):</p>
                              <code className="block select-all rounded bg-muted px-1.5 py-1 text-[11px]">claude auth login</code>
                            </div>
                          </div>

                          <SettingRow
                            label="claude binary path"
                            htmlFor="ai-claude-path"
                            info="Optional. Leave blank to auto-detect; set it only if Drafto can't find the `claude` command by itself."
                          >
                            <Input
                              id="ai-claude-path"
                              value={settings.aiClaudeBinaryPath}
                              onChange={(e) => setSettings((prev) => ({ ...prev, aiClaudeBinaryPath: e.target.value }))}
                              placeholder="e.g. /opt/homebrew/bin/claude"
                              className="h-7 max-w-[280px] text-xs"
                            />
                          </SettingRow>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── SAVE LOCATIONS ── */}
            {selectedSection === 'save' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">Choose default folders where generated files are saved.</p>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Drafts (Docx)</p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="docx-path"
                      value={settings.defaultDocxPath}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultDocxPath: e.target.value }))}
                      placeholder="C:\...\DOCX"
                      className="h-7 text-xs flex-1"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleBrowse("docx")} title="Browse">
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">PDF Paperbooks</p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="pdf-path"
                      value={settings.defaultPdfPath}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultPdfPath: e.target.value }))}
                      placeholder="C:\...\PDF"
                      className="h-7 text-xs flex-1"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleBrowse("pdf")} title="Browse">
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Project Files (.drafto)</p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="drafto-path"
                      value={settings.defaultDraftoPath}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultDraftoPath: e.target.value }))}
                      placeholder="C:\...\Projects"
                      className="h-7 text-xs flex-1"
                    />
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleBrowse("drafto")} title="Browse">
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

              </div>
            )}


            {/* ── SPECIAL LEAVE PETITION (SC) ── */}
            {selectedSection === 'slp' && (
              <div className="space-y-4">

                <SettingsGroup
                  title="Output text formatting"
                  info={"Body text of the generated SLP. Defaults: Times New Roman, 14 pt, 1.5 line spacing, 12 pt after each paragraph — strongly recommended.\n\nTo preserve the paperbook structure, these settings are not fully reflected in the Cover Page, Listing Proforma, Index and Office Report on Limitation — only the font type is applied there; their size and spacing stay fixed.\n\nMake sure the chosen font is installed on your computer, or the document may appear in a substitute font."}
                >
                  <SettingRow label="Font">
                    <Select value={settings.outputFont} onValueChange={(v) => setSettings((prev) => ({ ...prev, outputFont: v }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OUTPUT_FONTS.map((f) => (<SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Size & line spacing">
                    {numField('outputFontSizePt', { min: 8, max: 24, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    <Select value={String(settings.outputLineSpacing)} onValueChange={(v) => setSettings((prev) => ({ ...prev, outputLineSpacing: parseFloat(v) }))}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" className="text-xs">Single (1.0)</SelectItem>
                        <SelectItem value="1.15" className="text-xs">1.15</SelectItem>
                        <SelectItem value="1.5" className="text-xs">1.5</SelectItem>
                        <SelectItem value="2" className="text-xs">Double (2.0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Space after paragraph">
                    {numField('outputParaAfterPt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Page margins"
                  info={"Margins for every generated SLP document. Defaults: 1.5\" top and left, 1\" bottom and right. The Advocate's Checklist keeps its own top/left margins."}
                >
                  <SettingRow>
                    {marginInputs({ top: 'slpMarginTopIn', right: 'slpMarginRightIn', bottom: 'slpMarginBottomIn', left: 'slpMarginLeftIn' })}
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Quotes"
                  info="Line spacing applied to text formatted as a Quote. Quoted blocks are wrapped in quotation marks and italicised on export."
                >
                  <SettingRow label="Quote line spacing">
                    <SegGroup
                      value={settings.quoteLineSpacing}
                      onChange={(v: QuoteLineSpacing) => setSettings((prev) => ({ ...prev, quoteLineSpacing: v }))}
                      options={[{ value: 'default', label: 'Default' }, { value: 'single', label: 'Single' }]}
                    />
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Petition layout"
                  info={"How the petition itself is laid out. All three keep the wording of the petition unchanged — they affect only its presentation.\n\nThe defaults reproduce what Drafto has always generated, so nothing changes in your existing style unless you switch it here."}
                >
                  <SettingRow
                    label="Title block"
                    info={"Short: the title block Drafto has always produced.\n\nSCI form: adds the rule citation and the Article 136 line, following the format published by the Supreme Court. The rule cited follows the SLP type — Order XXI Rule 3(1)(a) for civil, Order XXII Rule 2(1) for criminal."}
                  >
                    <SegGroup
                      value={settings.slpHeaderStyle}
                      onChange={(v: SlpHeaderStyle) => setSettings((prev) => ({ ...prev, slpHeaderStyle: v }))}
                      options={[{ value: 'short', label: 'Short' }, { value: 'sci', label: 'SCI form' }]}
                    />
                  </SettingRow>
                  <div className="rounded border bg-white p-2 text-[11px] leading-snug text-black">
                    {settings.slpHeaderStyle === 'sci' ? (
                      <div className="text-center">
                        <div>IN THE SUPREME COURT OF INDIA</div>
                        <div>[S.C.R., Order XXI Rule 3(1)(a)]</div>
                        <div>CIVIL APPELLATE JURISDICTION</div>
                        <div>SPECIAL LEAVE PETITION</div>
                        <div>(Under Article 136 of the Constitution of India)</div>
                        <div className="mt-1 font-semibold">Special Leave Petition (Civil) No. _______ of {new Date().getFullYear()}</div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div>IN THE SUPREME COURT OF INDIA</div>
                        <div className="italic">Civil Appellate Jurisdiction</div>
                        <div className="mt-1 font-semibold">Special Leave Petition (Civil) No. _______ of {new Date().getFullYear()}</div>
                      </div>
                    )}
                  </div>

                  <SettingRow
                    label="Headings"
                    info={"Applies to every lead-in heading inside the petition — Questions of Law, the two Declarations, Grounds, Main Prayers, and both interim-relief headings. The paragraph number stays with the heading either way."}
                  >
                    <SegGroup
                      value={settings.slpHeadingBreak ? 'break' : 'inline'}
                      onChange={(v) => setSettings((prev) => ({ ...prev, slpHeadingBreak: v === 'break' }))}
                      options={[{ value: 'inline', label: 'Same line' }, { value: 'break', label: 'Own line' }]}
                    />
                  </SettingRow>
                  <div className="rounded border bg-white p-2 text-[11px] leading-snug text-black">
                    {settings.slpHeadingBreak ? (
                      <>
                        <div className="font-semibold">GROUNDS:</div>
                        <div>The Petitioner respectfully submits the following grounds…</div>
                      </>
                    ) : (
                      <div>
                        <span className="font-semibold">GROUNDS: </span>
                        The Petitioner respectfully submits the following grounds…
                      </div>
                    )}
                  </div>

                  <SettingRow
                    label="Translated copies"
                    info={"Where an annexure has both a true copy and a typed or translated copy, this decides which of the two comes first in the paper-book. The Index, the List of Dates and the page stamps all follow the order you choose."}
                  >
                    <SegGroup
                      value={settings.slpTranslatedCopyFirst ? 'translated' : 'true'}
                      onChange={(v) => setSettings((prev) => ({ ...prev, slpTranslatedCopyFirst: v === 'translated' }))}
                      options={[{ value: 'true', label: 'True copy first' }, { value: 'translated', label: 'Translated first' }]}
                    />
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Advocate-on-Record (AoR) details"
                  info={"Filled into every new project automatically, including the blank project created when Drafto launches. Changing them here does not alter projects you have already created.\n\nThe AI assistant will not overwrite these fields unless you explicitly ask it to."}
                >
                  <SettingRow label="AoR name" htmlFor="default-aor-name">
                    <Input
                      id="default-aor-name"
                      value={settings.defaultAorName}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultAorName: e.target.value }))}
                      placeholder="Advocate-on-Record name"
                      className="h-7 max-w-[280px] text-xs"
                    />
                  </SettingRow>
                  <SettingRow label="AoR code" htmlFor="default-aor-code">
                    <Input
                      id="default-aor-code"
                      value={settings.defaultAorCode}
                      onChange={(e) => setSettings((prev) => ({ ...prev, defaultAorCode: e.target.value }))}
                      placeholder="AoR registration code"
                      className="h-7 max-w-[280px] text-xs"
                    />
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Annexure labels"
                  info={"The \"Annexure P-X\" label stamped on the first page of each annexure. Defaults: size 14, margin 14.4 pt (0.2 inch) from the top edge. 72 pt = 1 inch."}
                >
                  <SettingRow label="Label text size">
                    <Slider
                      min={10}
                      max={24}
                      step={1}
                      value={[settings.annexureLabelSize]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, annexureLabelSize: v }))}
                      className="w-[170px]"
                    />
                    <span className="text-xs font-semibold tabular-nums">{settings.annexureLabelSize}</span>
                  </SettingRow>
                  <SettingRow label="Margin from top edge">
                    {numField('annexureLabelMarginPt', { min: 0, max: 144, step: 1, width: 'w-20' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <CheckRow
                    id="annexure-bg"
                    checked={settings.annexureLabelBackground}
                    onChange={(v) => setSettings((prev) => ({ ...prev, annexureLabelBackground: v }))}
                    label="White background behind annexure labels and page numbers"
                  />
                </SettingsGroup>

                <SettingsGroup
                  title="Page numbers"
                  info="Size and position of the page numbers stamped at the top-right of each paginated page. Defaults: 20 pt size, 54 pt (0.75 inch) top and right margins."
                >
                  <SettingRow label="Text size">
                    {numField('pageNumberSizePt', { min: 8, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Margins">
                    <Unit>Top</Unit>
                    {numField('pageNumberMarginTopPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>Right</Unit>
                    {numField('pageNumberMarginRightPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Advocate's checklist"
                  info={"Tighten these to keep the checklist from spilling over several pages in the PDF paperbook.\n\nDefaults: 14 pt font, 1.5 line spacing, 6 pt paragraph spacing, and 1 inch top and left margins (set 1.5 to match the other documents)."}
                >
                  <SettingRow label="Size & line spacing">
                    {numField('checklistFontSizePt', { min: 6, max: 18, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    <Select value={String(settings.checklistLineSpacing)} onValueChange={(v) => setSettings((prev) => ({ ...prev, checklistLineSpacing: parseFloat(v) }))}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" className="text-xs">Single (1.0)</SelectItem>
                        <SelectItem value="1.15" className="text-xs">1.15</SelectItem>
                        <SelectItem value="1.5" className="text-xs">1.5</SelectItem>
                        <SelectItem value="2" className="text-xs">Double (2.0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Space after paragraph">
                    {numField('checklistParaSpacingPt', { min: 0, max: 18, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Margins">
                    <Unit>Top</Unit>
                    {numField('checklistMarginTopInches', { min: 0.5, max: 2, step: 0.1, width: 'w-16' })}
                    <Unit>Left</Unit>
                    {numField('checklistMarginLeftInches', { min: 0.5, max: 2, step: 0.1, width: 'w-16' })}
                    <Unit>inches</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Volume splitting"
                  info="Paperbooks exceeding the first threshold are automatically split into volumes. Each additional threshold adds another volume."
                >
                  <SettingRow label="First threshold">
                    {numField('volumeSplitThreshold', { min: 100, step: 50, int: true, width: 'w-20' })}
                    <Unit>pages</Unit>
                  </SettingRow>
                  <SettingRow label="Subsequent step">
                    {numField('volumeStepSize', { min: 50, step: 50, int: true, width: 'w-20' })}
                    <Unit>pages</Unit>
                  </SettingRow>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedVolume((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAdvancedVolume ? "Hide advanced options" : "Show advanced options"}
                  </button>
                  {showAdvancedVolume && (
                    <div className="ml-1.5 space-y-1 border-l pl-4">
                      <SettingRow label="Keep intact" info="A component no longer than this is never split across a volume boundary.">
                        {numField('maxComponentSplitPages', { min: 1, step: 5, int: true, width: 'w-20' })}
                        <Unit>pages or fewer</Unit>
                      </SettingRow>
                      <SettingRow label="Retain in volume" info="If this much or less would spill into the next volume, the component stays in the current one.">
                        {numField('minVolumeTailPages', { min: 1, step: 5, int: true, width: 'w-20' })}
                        <Unit>pages or fewer</Unit>
                      </SettingRow>
                      <SettingRow label="Push to next volume" info="If this much or less would be left in the current volume, the component moves to the next one.">
                        {numField('minVolumeHeadPages', { min: 1, step: 5, int: true, width: 'w-20' })}
                        <Unit>pages or fewer</Unit>
                      </SettingRow>
                      <SettingRow label="Output format">
                        <SegGroup
                          value={settings.separateVolumePdfs ? 'separate' : 'consolidated'}
                          onChange={(v) => setSettings((prev) => ({ ...prev, separateVolumePdfs: v === 'separate' }))}
                          options={[{ value: 'separate', label: 'Separate PDFs' }, { value: 'consolidated', label: 'Single PDF' }]}
                        />
                      </SettingRow>
                    </div>
                  )}
                </SettingsGroup>

                <SettingsGroup
                  title="AoR signature & True Copy"
                  beta
                  info={"The signature is placed above the AoR's name in every \"Filed by\" block. The True Copy mark — a small signature above the words \"True Copy\" — is stamped on every annexure page at half the signature width.\n\nPro-tip: use a PNG with a transparent background and minimal white margins."}
                >
                  <SettingRow label="Signature (PNG)">
                    {signatureSlot({
                      png: settings.aorSignaturePng,
                      inputRef: signatureInputRef,
                      onUpload: handleSignatureUpload,
                      onRemove: () => setSettings((prev) => ({ ...prev, aorSignaturePng: "", aorSignatureW: 0, aorSignatureH: 0 })),
                    })}
                  </SettingRow>
                  <SettingRow label="Signature width">
                    <Slider
                      min={48}
                      max={240}
                      step={4}
                      value={[settings.signatureSizePx]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, signatureSizePx: v }))}
                      className="w-[170px]"
                    />
                    <span className="text-xs font-semibold tabular-nums">{settings.signatureSizePx}&nbsp;px</span>
                  </SettingRow>
                  {settings.aorSignaturePng && settings.aorSignatureW > 0 && (
                    <div className="flex items-center justify-center rounded border bg-white p-2">
                      <img
                        src={settings.aorSignaturePng}
                        alt="signature size preview"
                        style={{
                          width: settings.signatureSizePx,
                          height: settings.signatureSizePx * (settings.aorSignatureH / settings.aorSignatureW),
                        }}
                      />
                    </div>
                  )}
                  <CheckRow
                    id="place-signature"
                    disabled={!settings.aorSignaturePng}
                    checked={settings.placeSignatureInPaperbook}
                    onChange={(v) => setSettings((prev) => ({ ...prev, placeSignatureInPaperbook: v }))}
                    label={'Place the signature above the AoR name in every "Filed by" block'}
                  />
                  <CheckRow
                    id="place-truecopy"
                    disabled={!settings.aorSignaturePng}
                    checked={settings.placeTrueCopyText}
                    onChange={(v) => setSettings((prev) => ({ ...prev, placeTrueCopyText: v }))}
                    label={'Stamp "True Copy" with a small signature on every annexure page'}
                  />
                  {settings.placeTrueCopyText && (
                    <div className="ml-1.5 space-y-1 border-l pl-4">
                      <SettingRow label="True Copy position">
                        <SegGroup
                          value={settings.trueCopyPosition}
                          onChange={(v: TrueCopyPosition) => setSettings((prev) => ({ ...prev, trueCopyPosition: v }))}
                          options={[{ value: 'left', label: 'Bottom-left' }, { value: 'center', label: 'Bottom-centre' }]}
                        />
                      </SettingRow>
                      <SettingRow label="True Copy margins" info="Defaults: 36 pt (0.5 inch) on both. In bottom-centre mode the horizontal margin is ignored.">
                        <Unit>Horizontal</Unit>
                        {numField('trueCopyMarginXPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>Bottom</Unit>
                        {numField('trueCopyMarginBottomPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>pt</Unit>
                      </SettingRow>
                      <CheckRow
                        id="truecopy-bg"
                        checked={settings.trueCopyBackground}
                        onChange={(v) => setSettings((prev) => ({ ...prev, trueCopyBackground: v }))}
                        label="White background behind the True Copy stamp"
                      />
                    </div>
                  )}
                  <SignatureLiabilityNote />
                </SettingsGroup>

              </div>
            )}

            {/* ── WRIT PETITION (HC) ── */}
            {selectedSection === 'wp' && (
              <div className="space-y-4">

                <SettingsGroup
                  title={'"Filed by" defaults'}
                  info={"Pre-filled into the \"Filed by\" block of every new writ petition. Per-petition edits in the Preliminary tab override these."}
                >
                  {filedByFields(
                    settings.wpFiledBy ?? DEFAULT_WP_FILED_BY,
                    (patch) => setSettings((prev) => ({ ...prev, wpFiledBy: { ...(prev.wpFiledBy ?? DEFAULT_WP_FILED_BY), ...patch } })),
                  )}
                </SettingsGroup>

                <SettingsGroup
                  title="Advocate signature"
                  beta
                  info={"Placed above the advocate's name in every \"Filed by\" block of the writ-petition paperbook. Applied during PDF generation only — plain .docx exports never carry it. Separate from the SLP AoR signature.\n\nPro-tip: use a PNG with a transparent background and minimal white margins."}
                >
                  <SettingRow label="Signature (PNG)">
                    {signatureSlot({
                      png: settings.wpSignaturePng,
                      inputRef: wpSignatureInputRef,
                      onUpload: handleWpSignatureUpload,
                      onRemove: () => setSettings((prev) => ({ ...prev, wpSignaturePng: "", wpSignatureW: 0, wpSignatureH: 0 })),
                    })}
                  </SettingRow>
                  <SettingRow label="Signature width">
                    <Slider
                      min={48}
                      max={240}
                      step={4}
                      value={[settings.wpSignatureSizePx]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, wpSignatureSizePx: v }))}
                      className="w-[170px]"
                    />
                    <span className="text-xs font-semibold tabular-nums">{settings.wpSignatureSizePx}&nbsp;px</span>
                  </SettingRow>
                  {settings.wpSignaturePng && settings.wpSignatureW > 0 && (
                    <div className="flex items-center justify-center rounded border bg-white p-2">
                      <img
                        src={settings.wpSignaturePng}
                        alt="signature size preview"
                        style={{
                          width: settings.wpSignatureSizePx,
                          height: settings.wpSignatureSizePx * (settings.wpSignatureH / settings.wpSignatureW),
                        }}
                      />
                    </div>
                  )}
                  <CheckRow
                    id="wp-place-signature"
                    disabled={!settings.wpSignaturePng}
                    checked={settings.wpPlaceSignatureInPaperbook}
                    onChange={(v) => setSettings((prev) => ({ ...prev, wpPlaceSignatureInPaperbook: v }))}
                    label={'Place the signature above the advocate name in every "Filed by" block'}
                  />
                  <SignatureLiabilityNote />
                </SettingsGroup>

                <SettingsGroup
                  title="Annexure labels & page numbers"
                  info={"Stamped onto the paperbook during PDF generation. The annexure label appears on the first page of each annexure; page numbers on every numbered page. Stamps stay upright on rotated or scanned pages.\n\nIn top-right mode the label uses the page number's margins and its own top margin is ignored."}
                >
                  <SettingRow label="Stamp font">
                    <Select value={settings.wpStampFont} onValueChange={(v) => setSettings((prev) => ({ ...prev, wpStampFont: v as SettingsData['wpStampFont'] }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="times" className="text-xs" style={{ fontFamily: 'Times New Roman' }}>Times New Roman (Bold)</SelectItem>
                        <SelectItem value="helvetica" className="text-xs" style={{ fontFamily: 'Helvetica, Arial' }}>Helvetica / Arial (Bold)</SelectItem>
                        <SelectItem value="courier" className="text-xs" style={{ fontFamily: 'Courier New' }}>Courier (Bold)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Page number size">
                    {numField('wpPageNumberSizePt', { min: 8, max: 48, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Page number margins">
                    <Unit>Top</Unit>
                    {numField('wpPageNumberMarginTopPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>Right</Unit>
                    {numField('wpPageNumberMarginRightPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Annexure label size">
                    {numField('wpAnnexureLabelSizePt', { min: 8, max: 32, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Label position">
                    <Select value={settings.wpAnnexureLabelPosition} onValueChange={(v) => setSettings((prev) => ({ ...prev, wpAnnexureLabelPosition: v as SettingsData['wpAnnexureLabelPosition'] }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center" className="text-xs">Top-centre</SelectItem>
                        <SelectItem value="right" className="text-xs">Top-right (under the page number)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Label top margin">
                    {numField('wpAnnexureLabelMarginPt', { min: 0, max: 216, step: 0.1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <CheckRow
                    id="wp-stamp-bg"
                    checked={settings.wpStampBackground}
                    onChange={(v) => setSettings((prev) => ({ ...prev, wpStampBackground: v }))}
                    label="White background behind annexure labels and page numbers"
                  />
                  <CheckRow
                    id="wp-place-truecopy"
                    disabled={!settings.wpSignaturePng}
                    checked={settings.wpPlaceTrueCopyText}
                    onChange={(v) => setSettings((prev) => ({ ...prev, wpPlaceTrueCopyText: v }))}
                    label={`Stamp "True Copy" with the advocate's signature on every annexure page${!settings.wpSignaturePng ? " (upload a signature first)" : ""}`}
                  />
                  {settings.wpPlaceTrueCopyText && (
                    <div className="ml-1.5 space-y-1 border-l pl-4">
                      <SettingRow label="True Copy position">
                        <SegGroup
                          value={settings.wpTrueCopyPosition}
                          onChange={(v) => setSettings((prev) => ({ ...prev, wpTrueCopyPosition: v as SettingsData['wpTrueCopyPosition'] }))}
                          options={[{ value: 'left', label: 'Bottom-left' }, { value: 'center', label: 'Bottom-centre' }]}
                        />
                      </SettingRow>
                      <SettingRow
                        label="True Copy margins"
                        info="The True Copy signature renders at half the configured signature width. In bottom-centre mode the horizontal margin is ignored."
                      >
                        <Unit>Horizontal</Unit>
                        {numField('wpTrueCopyMarginXPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>Bottom</Unit>
                        {numField('wpTrueCopyMarginBottomPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>pt</Unit>
                      </SettingRow>
                      <CheckRow
                        id="wp-truecopy-bg"
                        checked={settings.wpTrueCopyBackground}
                        onChange={(v) => setSettings((prev) => ({ ...prev, wpTrueCopyBackground: v }))}
                        label="White background behind the True Copy stamp"
                      />
                    </div>
                  )}
                </SettingsGroup>

                <SettingsGroup
                  title={'"Filed by" table layout'}
                  info={"The left column carries Filed on / Place; the advocate details take the rest.\n\nIn the list below, the arrows reorder the details, B / I / U style them, and \"| next\" keeps an item on the same line as the one under it, separated by \" | \".\n\nThe preview approximates the docx output, including the signature at its configured size."}
                >
                  <SettingRow label="Left column width">
                    <Slider
                      min={10}
                      max={70}
                      step={1}
                      value={[settings.wpFiledByLeftPct]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, wpFiledByLeftPct: v }))}
                      className="w-[170px]"
                    />
                    <span className="text-xs font-semibold tabular-nums">{settings.wpFiledByLeftPct}% / {100 - settings.wpFiledByLeftPct}%</span>
                  </SettingRow>
                  {filedByDesigner(
                    settings.wpFiledByLayout,
                    (next) => setSettings((prev) => ({ ...prev, wpFiledByLayout: next })),
                  )}
                  {filedByPreview({
                    leftPct: settings.wpFiledByLeftPct,
                    layout: settings.wpFiledByLayout,
                    filedBy: settings.wpFiledBy,
                    signaturePng: settings.wpSignaturePng,
                    signatureW: settings.wpSignatureW,
                    signatureH: settings.wpSignatureH,
                    signatureSizePx: settings.wpSignatureSizePx,
                    placeSignature: settings.wpPlaceSignatureInPaperbook,
                    font: settings.wpOutputFont,
                    fontSizePt: settings.wpOutputFontSizePt,
                    marginLeftIn: settings.wpMarginLeftIn,
                    marginRightIn: settings.wpMarginRightIn,
                  })}
                </SettingsGroup>

                <SettingsGroup
                  title="Facts & List of Dates"
                  info={"Reproduce: one List of Dates carrying the annexures, and the Facts are generated from it — “On <date>, <event>” plus the annexure sentences. This is how Drafto has always worked.\n\nSeparate: the List of Dates keeps only dates and particulars, and the Facts get a table of their own — the same table minus the date column, annexures and all. Use this where you want a concise chronology but a full, para-wise narration.\n\nIn separate mode every annexure, including in the Index, comes from the Facts table. You can still generate the Facts rows from the List of Dates in one click."}
                >
                  <SettingRow label="Facts section">
                    <SegGroup
                      value={settings.wpFactsFromLod ? 'reproduce' : 'separate'}
                      onChange={(v) => setSettings((prev) => ({ ...prev, wpFactsFromLod: v === 'reproduce' }))}
                      options={[
                        { value: 'reproduce', label: 'From the List of Dates' },
                        { value: 'separate', label: 'Its own table' },
                      ]}
                    />
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Vakalatnama formatting"
                  info="The vakalatnama uses its own smaller, tighter formatting so it fits on a single page. Defaults: 11 pt, single line spacing, 4 pt after each paragraph."
                >
                  <SettingRow label="Size & line spacing">
                    {numField('wpVakFontSizePt', { min: 6, max: 24, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    {numField('wpVakLineSpacing', { min: 1, max: 3, step: 0.05, width: 'w-16' })}
                    <Unit>lines</Unit>
                  </SettingRow>
                  <SettingRow label="Space after paragraph">
                    {numField('wpVakParaSpacingPt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Page margins"
                  info={"Margins for every generated writ-petition document. Defaults: 1.5\" top and left, 1\" bottom and right — the top margin leaves room for the stamped page number."}
                >
                  <SettingRow>
                    {marginInputs({ top: 'wpMarginTopIn', right: 'wpMarginRightIn', bottom: 'wpMarginBottomIn', left: 'wpMarginLeftIn' })}
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Output text formatting"
                  info="Body text of the generated writ petition. Defaults: Times New Roman, 14 pt, 1.5 line spacing, 0 pt before / 12 pt after each paragraph."
                >
                  <SettingRow label="Font">
                    <Select value={settings.wpOutputFont} onValueChange={(v) => setSettings((prev) => ({ ...prev, wpOutputFont: v }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OUTPUT_FONTS.map((f) => (<SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Size & line spacing">
                    {numField('wpOutputFontSizePt', { min: 8, max: 24, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    <Select value={String(settings.wpOutputLineSpacing)} onValueChange={(v) => setSettings((prev) => ({ ...prev, wpOutputLineSpacing: parseFloat(v) }))}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" className="text-xs">Single (1.0)</SelectItem>
                        <SelectItem value="1.15" className="text-xs">1.15</SelectItem>
                        <SelectItem value="1.5" className="text-xs">1.5</SelectItem>
                        <SelectItem value="2" className="text-xs">Double (2.0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Space around paragraphs">
                    <Unit>Before</Unit>
                    {numField('wpOutputParaBeforePt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>After</Unit>
                    {numField('wpOutputParaAfterPt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Sub-paragraph numbering"
                  info="First-level lettering for each section. Deeper levels follow a fixed cascade automatically."
                >
                  {([
                    ["facts", "Facts"],
                    ["grounds", "Grounds"],
                    ["prayers", "Prayers"],
                  ] as [keyof WpNumbering, string][]).map(([key, label]) => (
                    <SettingRow key={String(key)} label={label}>
                      <Select
                        value={settings.wpNumbering?.[key] ?? DEFAULT_WP_NUMBERING[key]}
                        onValueChange={(v) => setSettings((prev) => ({ ...prev, wpNumbering: { ...(prev.wpNumbering ?? DEFAULT_WP_NUMBERING), [key]: v as EnumStyle } }))}
                      >
                        <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WP_NUMBER_STYLES.map((s) => (<SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </SettingRow>
                  ))}
                </SettingsGroup>

              </div>
            )}


            {/* ── ORIGINAL APPLICATION (CAT) ── */}
            {selectedSection === 'oa' && (
              <div className="space-y-4">

                <SettingsGroup
                  title="Bench"
                  info={"The Tribunal Bench printed in the OA header, and used for \"Registrar, <Bench>\" references."}
                >
                  <SettingRow label="Bench">
                    <select
                      value={settings.oaBench || DEFAULT_OA_BENCH}
                      onChange={(e) => setSettings((prev) => ({ ...prev, oaBench: e.target.value }))}
                      className="h-7 w-full max-w-[320px] rounded-md border bg-background px-2 text-xs"
                    >
                      {(["Regular", "Circuit"] as const).map((group) => (
                        <optgroup key={group} label={group === "Regular" ? "Regular Benches" : "Circuit Benches"}>
                          {OA_BENCHES.filter((b) => b.group === group).map((b) => (
                            <option key={b.value} value={b.value}>{b.header}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title={'Advocate details ("Filed by")'}
                  info={"Pre-filled into the \"Filed by\" block of every new Original Application. Per-case edits override these."}
                >
                  {filedByFields(
                    settings.oaFiledBy ?? DEFAULT_WP_FILED_BY,
                    (patch) => setSettings((prev) => ({ ...prev, oaFiledBy: { ...(prev.oaFiledBy ?? DEFAULT_WP_FILED_BY), ...patch } })),
                  )}
                </SettingsGroup>

                <SettingsGroup
                  title="Advocate signature"
                  beta
                  info={"Placed above the advocate's name in the \"Filed by\" block of the generated paper-book. Applied during PDF generation only.\n\nPro-tip: use a PNG with a transparent background and minimal white margins."}
                >
                  <SettingRow label="Signature (PNG)">
                    {signatureSlot({
                      png: settings.oaSignaturePng,
                      inputRef: oaSignatureInputRef,
                      onUpload: handleOaSignatureUpload,
                      onRemove: () => setSettings((prev) => ({ ...prev, oaSignaturePng: "", oaSignatureW: 0, oaSignatureH: 0 })),
                    })}
                  </SettingRow>
                  <SettingRow label="Signature width">
                    {numField('oaSignatureSizePx', { min: 24, max: 400, step: 1, int: true, width: 'w-20' })}
                    <Unit>px</Unit>
                  </SettingRow>
                  <CheckRow
                    id="oa-place-signature"
                    checked={settings.oaPlaceSignatureInPaperbook}
                    onChange={(v) => setSettings((prev) => ({ ...prev, oaPlaceSignatureInPaperbook: v }))}
                    label="Place the signature in the paper-book"
                  />
                  <SignatureLiabilityNote />
                </SettingsGroup>

                <SettingsGroup
                  title="Annexure labels & page numbers"
                  info={"Stamped onto the paperbook during PDF generation. The annexure label appears on the first page of each annexure; page numbers on every numbered page. Stamps stay upright on rotated or scanned pages.\n\nIn top-right mode the label uses the page number's margins and its own top margin is ignored."}
                >
                  <SettingRow label="Stamp font">
                    <Select value={settings.oaStampFont} onValueChange={(v) => setSettings((prev) => ({ ...prev, oaStampFont: v as SettingsData['oaStampFont'] }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="times" className="text-xs" style={{ fontFamily: 'Times New Roman' }}>Times New Roman (Bold)</SelectItem>
                        <SelectItem value="helvetica" className="text-xs" style={{ fontFamily: 'Helvetica, Arial' }}>Helvetica / Arial (Bold)</SelectItem>
                        <SelectItem value="courier" className="text-xs" style={{ fontFamily: 'Courier New' }}>Courier (Bold)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Page number size">
                    {numField('oaPageNumberSizePt', { min: 8, max: 48, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Page number margins">
                    <Unit>Top</Unit>
                    {numField('oaPageNumberMarginTopPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>Right</Unit>
                    {numField('oaPageNumberMarginRightPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Annexure label size">
                    {numField('oaAnnexureLabelSizePt', { min: 8, max: 32, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <SettingRow label="Label position">
                    <Select value={settings.oaAnnexureLabelPosition} onValueChange={(v) => setSettings((prev) => ({ ...prev, oaAnnexureLabelPosition: v as SettingsData['oaAnnexureLabelPosition'] }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center" className="text-xs">Top-centre</SelectItem>
                        <SelectItem value="right" className="text-xs">Top-right (under the page number)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Label top margin">
                    {numField('oaAnnexureLabelMarginPt', { min: 0, max: 216, step: 0.1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                  <CheckRow
                    id="oa-stamp-bg"
                    checked={settings.oaStampBackground}
                    onChange={(v) => setSettings((prev) => ({ ...prev, oaStampBackground: v }))}
                    label="White background behind annexure labels and page numbers"
                  />
                  <CheckRow
                    id="oa-place-truecopy"
                    disabled={!settings.oaSignaturePng}
                    checked={settings.oaPlaceTrueCopyText}
                    onChange={(v) => setSettings((prev) => ({ ...prev, oaPlaceTrueCopyText: v }))}
                    label={`Stamp "True Copy" with the advocate's signature on every annexure page${!settings.oaSignaturePng ? " (upload a signature first)" : ""}`}
                  />
                  {settings.oaPlaceTrueCopyText && (
                    <div className="ml-1.5 space-y-1 border-l pl-4">
                      <SettingRow label="True Copy position">
                        <SegGroup
                          value={settings.oaTrueCopyPosition}
                          onChange={(v) => setSettings((prev) => ({ ...prev, oaTrueCopyPosition: v as SettingsData['oaTrueCopyPosition'] }))}
                          options={[{ value: 'left', label: 'Bottom-left' }, { value: 'center', label: 'Bottom-centre' }]}
                        />
                      </SettingRow>
                      <SettingRow
                        label="True Copy margins"
                        info="The True Copy signature renders at half the configured signature width. In bottom-centre mode the horizontal margin is ignored."
                      >
                        <Unit>Horizontal</Unit>
                        {numField('oaTrueCopyMarginXPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>Bottom</Unit>
                        {numField('oaTrueCopyMarginBottomPt', { min: 0, max: 216, step: 1, width: 'w-16' })}
                        <Unit>pt</Unit>
                      </SettingRow>
                      <CheckRow
                        id="oa-truecopy-bg"
                        checked={settings.oaTrueCopyBackground}
                        onChange={(v) => setSettings((prev) => ({ ...prev, oaTrueCopyBackground: v }))}
                        label="White background behind the True Copy stamp"
                      />
                    </div>
                  )}
                </SettingsGroup>

                <SettingsGroup
                  title={'"Filed by" table layout'}
                  info={"The left column carries Filed on / Place; the advocate details take the rest.\n\nIn the list below, the arrows reorder the details, B / I / U style them, and \"| next\" keeps an item on the same line as the one under it, separated by \" | \".\n\nThe preview approximates the docx output, including the signature at its configured size."}
                >
                  <SettingRow label="Left column width">
                    <Slider
                      min={10}
                      max={70}
                      step={1}
                      value={[settings.oaFiledByLeftPct]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, oaFiledByLeftPct: v }))}
                      className="w-[170px]"
                    />
                    <span className="text-xs font-semibold tabular-nums">{settings.oaFiledByLeftPct}% / {100 - settings.oaFiledByLeftPct}%</span>
                  </SettingRow>
                  {filedByDesigner(
                    settings.oaFiledByLayout,
                    (next) => setSettings((prev) => ({ ...prev, oaFiledByLayout: next })),
                  )}
                  {filedByPreview({
                    leftPct: settings.oaFiledByLeftPct,
                    layout: settings.oaFiledByLayout,
                    filedBy: settings.oaFiledBy,
                    signaturePng: settings.oaSignaturePng,
                    signatureW: settings.oaSignatureW,
                    signatureH: settings.oaSignatureH,
                    signatureSizePx: settings.oaSignatureSizePx,
                    placeSignature: settings.oaPlaceSignatureInPaperbook,
                    font: settings.oaOutputFont,
                    fontSizePt: settings.oaOutputFontSizePt,
                    marginLeftIn: settings.oaMarginLeftIn,
                    marginRightIn: settings.oaMarginRightIn,
                  })}
                </SettingsGroup>

                <SettingsGroup
                  title="Last page"
                  info={"On: Paras 10–12, the Filed-by block and the Verification always begin a new page, so last pages signed in advance drop into the paper-book at a clean boundary.\n\nOff: the paragraphs flow on from Para 9.\n\nWhere several Applicants sign, each additional last page always starts a fresh page."}
                >
                  <CheckRow
                    id="oa-force-lastpage"
                    checked={settings.oaForceLastPageBreak}
                    onChange={(v) => setSettings((prev) => ({ ...prev, oaForceLastPageBreak: v }))}
                    label="Start the Last Page on a fresh page (page break after Para 9)"
                  />
                </SettingsGroup>

                <SettingsGroup
                  title="Page margins"
                  info={"Margins for every generated Original Application document. Defaults: 1.5\" top and left, 1\" bottom and right — the top margin leaves room for the stamped page number."}
                >
                  <SettingRow>
                    {marginInputs({ top: 'oaMarginTopIn', right: 'oaMarginRightIn', bottom: 'oaMarginBottomIn', left: 'oaMarginLeftIn' })}
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Output text formatting"
                  info="Body text of the generated Original Application. Defaults: Times New Roman, 14 pt, 1.5 line spacing, 0 pt before / 12 pt after each paragraph."
                >
                  <SettingRow label="Font">
                    <Select value={settings.oaOutputFont} onValueChange={(v) => setSettings((prev) => ({ ...prev, oaOutputFont: v }))}>
                      <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OUTPUT_FONTS.map((f) => (<SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow label="Size & line spacing">
                    {numField('oaOutputFontSizePt', { min: 8, max: 24, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    {numField('oaOutputLineSpacing', { min: 1, max: 3, step: 0.05, width: 'w-16' })}
                    <Unit>lines</Unit>
                  </SettingRow>
                  <SettingRow label="Space around paragraphs">
                    <Unit>Before</Unit>
                    {numField('oaOutputParaBeforePt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>After</Unit>
                    {numField('oaOutputParaAfterPt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Facts & List of Dates"
                  info={"Reproduce: one List of Dates carrying the annexures, and the Facts are generated from it — “On <date>, <event>” plus the annexure sentences. This is how Drafto has always worked.\n\nSeparate: the List of Dates keeps only dates and particulars, and the Facts get a table of their own — the same table minus the date column, annexures and all. Use this where you want a concise chronology but a full, para-wise narration.\n\nIn separate mode every annexure, including in the Index, comes from the Facts table. You can still generate the Facts rows from the List of Dates in one click."}
                >
                  <SettingRow label="Facts section">
                    <SegGroup
                      value={settings.oaFactsFromLod ? 'reproduce' : 'separate'}
                      onChange={(v) => setSettings((prev) => ({ ...prev, oaFactsFromLod: v === 'reproduce' }))}
                      options={[
                        { value: 'reproduce', label: 'From the List of Dates' },
                        { value: 'separate', label: 'Its own table' },
                      ]}
                    />
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup
                  title="Vakalatnama formatting"
                  info="The vakalatnama uses its own smaller, tighter formatting so it fits on a single page. Defaults: 11 pt, single line spacing, 4 pt after each paragraph."
                >
                  <SettingRow label="Size & line spacing">
                    {numField('oaVakFontSizePt', { min: 6, max: 24, step: 0.5, width: 'w-16' })}
                    <Unit>pt</Unit>
                    {numField('oaVakLineSpacing', { min: 1, max: 3, step: 0.05, width: 'w-16' })}
                    <Unit>lines</Unit>
                  </SettingRow>
                  <SettingRow label="Space after paragraph">
                    {numField('oaVakParaSpacingPt', { min: 0, max: 36, step: 1, width: 'w-16' })}
                    <Unit>pt</Unit>
                  </SettingRow>
                </SettingsGroup>

              </div>
            )}

            {/* ── SHORTCUTS ── */}
            {selectedSection === 'shortcuts' && (
              <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                  Keyboard shortcuts available in Drafto. On a Mac, use <span className="font-semibold">⌘</span> wherever <span className="font-semibold">Ctrl</span> is shown, except where noted.
                </p>
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">{group.title}</p>
                    {group.hint && <p className="text-[11px] text-muted-foreground -mt-1">{group.hint}</p>}
                    <div className="rounded-md border border-border divide-y divide-border">
                      {group.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                          <span className="text-xs text-foreground">
                            {item.action}
                            {item.note && <span className="text-[10px] text-muted-foreground italic ml-1">({item.note})</span>}
                          </span>
                          <ShortcutKeys keys={item.keys} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── SUPPORT ── */}
            {selectedSection === 'support' && (
              <div className="space-y-4">
                <SettingsGroup title="About">
                  <SettingRow label="Version">
                    <span className="text-xs font-semibold tabular-nums">{__APP_VERSION__}</span>
                    {import.meta.env.DEV && <Unit>(dev build)</Unit>}
                  </SettingRow>
                </SettingsGroup>

                {/* Subscription — plan + status, straight from the entitlement layer */}
                <SettingsGroup
                  title="Subscription"
                  info={"Your plan sets how many courts you may hold; which ones is your own choice. Status comes from the last successful check with the billing server, so it can lag a payment by a few minutes — use Re-check after paying.\n\nRead-only means you can still open and read your projects, but not edit them or generate anything."}
                >
                  {!ENTITLEMENT_ENABLED ? (
                    <SettingRow label="Plan">
                      <span className="text-xs text-muted-foreground">Not enforced in this build.</span>
                    </SettingRow>
                  ) : (
                    <>
                      <SettingRow label="Plan">
                        <span className="text-xs font-medium">
                          {entLoading ? "Checking…" : planLabel(entitlement.plan)}
                        </span>
                        {!entLoading && <EntitlementChip reason={entitlement.reason} />}
                      </SettingRow>
                      <SettingRow label="Courts covered">
                        <span className="text-xs text-muted-foreground">
                          {entLoading
                            ? "…"
                            : entitlement.forums.length > 0
                              ? entitlement.forums.map((f) => FORUM_LABEL[f]).join(" · ")
                              : "None"}
                        </span>
                      </SettingRow>
                      {entitlement.fromCache && (
                        <SettingRow label="">
                          <span className="text-[11px] text-muted-foreground">
                            Shown from the last check — Drafto could not reach the billing server.
                          </span>
                        </SettingRow>
                      )}
                      <SettingRow label="">
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={openManageSubscription}>
                          <ExternalLink className="h-3.5 w-3.5" /> Manage subscription
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={refreshEntitlement}>
                          <RefreshCw className="h-3.5 w-3.5" /> Re-check
                        </Button>
                      </SettingRow>
                    </>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Your usage">
                  <SettingRow label="Paperbooks (PDF)">
                    <span className="text-xs font-semibold tabular-nums">{usageCounts === null ? "…" : usageCounts.paperbooksGenerated}</span>
                  </SettingRow>
                  <SettingRow label="Drafts (DOCX)">
                    <span className="text-xs font-semibold tabular-nums">{usageCounts === null ? "…" : usageCounts.docxGenerated}</span>
                  </SettingRow>
                </SettingsGroup>

                <SettingsGroup title="Devices">
                  <ManageDevices compact />
                </SettingsGroup>

                <SettingsGroup title="Updates">
                  {updateStatus === 'idle' && (
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleUpdate}>
                      <RefreshCw className="h-3.5 w-3.5" /> Check for Updates
                    </Button>
                  )}
                  {updateStatus === 'checking' && (
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
                    </Button>
                  )}
                  {updateStatus === 'up-to-date' && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3.5 w-3.5" /> You're on the latest version.
                      </div>
                      <button type="button" onClick={() => setUpdateStatus('idle')} className="text-xs text-muted-foreground underline underline-offset-2 hover:opacity-80">Check again</button>
                    </div>
                  )}
                  {updateStatus === 'available' && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">Version <span className="font-semibold">{updateVersion}</span> is available.</p>
                      <Button type="button" size="sm" className="h-7 w-fit gap-1.5 text-xs" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5" /> Download &amp; Install
                      </Button>
                    </div>
                  )}
                  {updateStatus === 'downloading' && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Downloading update… {downloadPercent}%</p>
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                      </div>
                    </div>
                  )}
                  {updateStatus === 'downloaded' && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">Update ready. The app will restart to install.</p>
                      <Button type="button" size="sm" className="h-7 w-fit gap-1.5 text-xs" onClick={handleInstall}>
                        <RefreshCw className="h-3.5 w-3.5" /> Restart &amp; Install
                      </Button>
                    </div>
                  )}
                  {updateStatus === 'error' && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" /> Update check failed.
                      </div>
                      <button type="button" onClick={handleUpdate} className="text-xs text-muted-foreground underline underline-offset-2 hover:opacity-80">Retry</button>
                    </div>
                  )}
                  {updateStatus === 'dev' && (
                    <p className="text-xs italic text-muted-foreground">Updates are not available in development mode.</p>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Legal">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setLicenseOpen(true)}
                      className="w-fit text-left text-xs text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      Software License Agreement
                    </button>
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="w-fit text-left text-xs text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      Terms &amp; Conditions
                    </button>
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Contact">
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReachOut}>
                    <ExternalLink className="h-3.5 w-3.5" /> Reach Out
                  </Button>
                </SettingsGroup>
              </div>
            )}

          </div>{/* end right content */}
        </div>{/* end split layout */}

        {/* Legal popups */}
        <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
          <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Software License Agreement</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground border rounded p-3">
              {LICENSE_TEXT}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
          <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Terms &amp; Conditions</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground border rounded p-3">
              {TERMS_TEXT}
            </div>
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Interface text size = root font-size (px); all rem-based UI text scales off it.
function applyUiFontSize(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = `${px || DEFAULT_UI_FONT_SIZE}px`;
}

// Editing text size = absolute px applied to inputs / textareas / the editor
// via a CSS variable (see globals.css).
function applyInputFontSize(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty('--input-font-size', `${px || DEFAULT_INPUT_FONT_SIZE}px`);
}

function applyUiFont(font: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty('--ui-font', font || DEFAULT_UI_FONT);
}

function applyInputFont(font: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty('--input-font', font || DEFAULT_INPUT_FONT);
}

// Helper function to get settings
export function getSettings(): SettingsData {
  const defaults: SettingsData = {
    defaultDocxPath: "",
    defaultPdfPath: "",
    defaultDraftoPath: "",
    uiFont: DEFAULT_UI_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    inputFont: DEFAULT_INPUT_FONT,
    inputFontSize: DEFAULT_INPUT_FONT_SIZE,
    annexureLabelBackground: false,
    annexureLabelSize: 14,
    annexureLabelMarginPt: 14.4,
    pageNumberSizePt: 20,
    pageNumberMarginTopPt: 54,
    pageNumberMarginRightPt: 54,
    trueCopyMarginXPt: 36,
    trueCopyMarginBottomPt: 36,
    checklistFontSizePt: 14,
    checklistLineSpacing: 1.5,
    checklistParaSpacingPt: 6,
    checklistMarginTopInches: 1,
    checklistMarginLeftInches: 1,
    exportHighlight: false,
    autosaveInterval: 60,
    toastDuration: 1,
    slpTabView: 'splitter' as SlpTabView,
    quoteLineSpacing: 'default' as QuoteLineSpacing,
    volumeSplitThreshold: 400,
    volumeStepSize: 200,
    maxComponentSplitPages: 50,
    minVolumeTailPages: 20,
    minVolumeHeadPages: 20,
    separateVolumePdfs: true,
    aorSignaturePng: "",
    aorSignatureW: 0,
    aorSignatureH: 0,
    placeSignatureInPaperbook: false,
    placeTrueCopyText: false,
    signatureSizePx: 120,
    trueCopyPosition: 'left' as TrueCopyPosition,
    trueCopyBackground: false,
    outputFont: 'Times New Roman',
    outputFontSizePt: 14,
    outputLineSpacing: 1.5,
    outputParaAfterPt: 12,
    slpHeaderStyle: 'short' as SlpHeaderStyle,
    slpHeadingBreak: false,
    slpTranslatedCopyFirst: false,
    wpFactsFromLod: true,
    oaFactsFromLod: true,
    aiPluginEnabled: false,
    aiClaudeBinaryPath: "",
    aiModel: 'default' as AiModel,
    defaultAorName: "",
    defaultAorCode: "",
    wpNumbering: DEFAULT_WP_NUMBERING,
    wpFiledBy: DEFAULT_WP_FILED_BY,
    wpSignaturePng: "",
    wpSignatureW: 0,
    wpSignatureH: 0,
    wpPlaceSignatureInPaperbook: false,
    wpSignatureSizePx: 120,
    slpMarginTopIn: 1.5,
    slpMarginRightIn: 1,
    slpMarginBottomIn: 1,
    slpMarginLeftIn: 1.5,
    wpMarginTopIn: 1.5,
    wpMarginRightIn: 1,
    wpMarginBottomIn: 1,
    wpMarginLeftIn: 1.5,
    wpOutputFont: 'Times New Roman',
    wpOutputFontSizePt: 14,
    wpOutputLineSpacing: 1.5,
    wpOutputParaBeforePt: 0,
    wpOutputParaAfterPt: 12,
    wpFiledByLeftPct: 40,
    wpFiledByLayout: normalizeWpFiledByLayout(null),
    wpStampFont: 'times' as const,
    wpPageNumberSizePt: 20,
    wpPageNumberMarginTopPt: 54,
    wpPageNumberMarginRightPt: 54,
    wpAnnexureLabelSizePt: 14,
    wpAnnexureLabelMarginPt: 14.4,
    wpAnnexureLabelPosition: 'center' as const,
    wpStampBackground: false,
    wpPlaceTrueCopyText: false,
    wpTrueCopyPosition: 'left' as const,
    wpTrueCopyBackground: false,
    wpTrueCopyMarginXPt: 36,
    wpTrueCopyMarginBottomPt: 36,
    oaBench: DEFAULT_OA_BENCH,
    oaFiledBy: DEFAULT_WP_FILED_BY,
    oaFiledByLeftPct: 40,
    oaFiledByLayout: normalizeWpFiledByLayout(null),
    oaSignaturePng: "",
    oaSignatureW: 0,
    oaSignatureH: 0,
    oaPlaceSignatureInPaperbook: false,
    oaSignatureSizePx: 120,
    oaStampFont: 'times',
    oaPageNumberSizePt: 20,
    oaPageNumberMarginTopPt: 54,
    oaPageNumberMarginRightPt: 54,
    oaAnnexureLabelSizePt: 14,
    oaAnnexureLabelMarginPt: 14.4,
    oaAnnexureLabelPosition: 'center',
    oaStampBackground: false,
    oaPlaceTrueCopyText: false,
    oaTrueCopyPosition: 'left',
    oaTrueCopyBackground: false,
    oaTrueCopyMarginXPt: 36,
    oaTrueCopyMarginBottomPt: 36,
    oaMarginTopIn: 1.5,
    oaMarginRightIn: 1,
    oaMarginBottomIn: 1,
    oaMarginLeftIn: 1.5,
    oaOutputFont: 'Times New Roman',
    oaOutputFontSizePt: 14,
    oaOutputLineSpacing: 1.5,
    oaOutputParaBeforePt: 0,
    oaOutputParaAfterPt: 12,
    oaVakFontSizePt: 11,
    oaVakLineSpacing: 1,
    oaVakParaSpacingPt: 4,
    wpVakFontSizePt: 11,
    wpVakLineSpacing: 1,
    wpVakParaSpacingPt: 4,
    oaForceLastPageBreak: true,
  };

  if (typeof window === "undefined") return defaults;

  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        defaultDocxPath: parsed.defaultDocxPath || "",
        defaultPdfPath: parsed.defaultPdfPath || "",
        defaultDraftoPath: parsed.defaultDraftoPath || "",
        uiFont: parsed.uiFont || DEFAULT_UI_FONT,
        uiFontSize: parsed.uiFontSize ?? DEFAULT_UI_FONT_SIZE,
        inputFont: parsed.inputFont || DEFAULT_INPUT_FONT,
        inputFontSize: parsed.inputFontSize ?? DEFAULT_INPUT_FONT_SIZE,
        annexureLabelBackground: parsed.annexureLabelBackground ?? false,
        annexureLabelSize: parsed.annexureLabelSize ?? 14,
        annexureLabelMarginPt: parsed.annexureLabelMarginPt ?? 14.4,
        pageNumberSizePt: parsed.pageNumberSizePt ?? 20,
        pageNumberMarginTopPt: parsed.pageNumberMarginTopPt ?? 54,
        pageNumberMarginRightPt: parsed.pageNumberMarginRightPt ?? 54,
        trueCopyMarginXPt: parsed.trueCopyMarginXPt ?? 36,
        trueCopyMarginBottomPt: parsed.trueCopyMarginBottomPt ?? 36,
        checklistFontSizePt: parsed.checklistFontSizePt ?? 14,
        checklistLineSpacing: parsed.checklistLineSpacing ?? 1.5,
        checklistParaSpacingPt: parsed.checklistParaSpacingPt ?? 6,
        checklistMarginTopInches: parsed.checklistMarginTopInches ?? 1,
        checklistMarginLeftInches: parsed.checklistMarginLeftInches ?? 1,
        exportHighlight: parsed.exportHighlight ?? false,
        autosaveInterval: parsed.autosaveInterval ?? 60,
        toastDuration: parsed.toastDuration ?? 1,
        slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
        quoteLineSpacing: (parsed.quoteLineSpacing || 'default') as QuoteLineSpacing,
        volumeSplitThreshold: parsed.volumeSplitThreshold ?? 400,
        volumeStepSize: parsed.volumeStepSize ?? 200,
        maxComponentSplitPages: parsed.maxComponentSplitPages ?? 50,
        minVolumeTailPages: parsed.minVolumeTailPages ?? 20,
        minVolumeHeadPages: parsed.minVolumeHeadPages ?? 20,
        separateVolumePdfs: parsed.separateVolumePdfs ?? true,
        aorSignaturePng: parsed.aorSignaturePng ?? "",
        aorSignatureW: parsed.aorSignatureW ?? 0,
        aorSignatureH: parsed.aorSignatureH ?? 0,
        placeSignatureInPaperbook: parsed.placeSignatureInPaperbook ?? false,
        placeTrueCopyText: parsed.placeTrueCopyText ?? false,
        signatureSizePx: parsed.signatureSizePx ?? 120,
        trueCopyPosition: (parsed.trueCopyPosition || 'left') as TrueCopyPosition,
        trueCopyBackground: parsed.trueCopyBackground ?? false,
        outputFont: parsed.outputFont || 'Times New Roman',
        outputFontSizePt: parsed.outputFontSizePt ?? 14,
        outputLineSpacing: parsed.outputLineSpacing ?? 1.5,
        outputParaAfterPt: parsed.outputParaAfterPt ?? 12,
        slpHeaderStyle: (parsed.slpHeaderStyle === 'sci' ? 'sci' : 'short') as SlpHeaderStyle,
        slpHeadingBreak: parsed.slpHeadingBreak ?? false,
        slpTranslatedCopyFirst: parsed.slpTranslatedCopyFirst ?? false,
        wpFactsFromLod: parsed.wpFactsFromLod ?? true,
        oaFactsFromLod: parsed.oaFactsFromLod ?? true,
        aiPluginEnabled: parsed.aiPluginEnabled ?? false,
        aiClaudeBinaryPath: parsed.aiClaudeBinaryPath ?? "",
        aiModel: (parsed.aiModel || 'default') as AiModel,
        defaultAorName: parsed.defaultAorName ?? "",
        defaultAorCode: parsed.defaultAorCode ?? "",
        wpNumbering: {
          facts: parsed.wpNumbering?.facts ?? DEFAULT_WP_NUMBERING.facts,
          grounds: parsed.wpNumbering?.grounds ?? DEFAULT_WP_NUMBERING.grounds,
          prayers: parsed.wpNumbering?.prayers ?? DEFAULT_WP_NUMBERING.prayers,
        },
        wpFiledBy: {
          name: parsed.wpFiledBy?.name ?? "",
          firm: parsed.wpFiledBy?.firm ?? "",
          address: parsed.wpFiledBy?.address ?? "",
          enrolmentNo: parsed.wpFiledBy?.enrolmentNo ?? "",
          email: parsed.wpFiledBy?.email ?? "",
          phone: parsed.wpFiledBy?.phone ?? "",
        },
        wpSignaturePng: parsed.wpSignaturePng ?? "",
        wpSignatureW: parsed.wpSignatureW ?? 0,
        wpSignatureH: parsed.wpSignatureH ?? 0,
        wpPlaceSignatureInPaperbook: parsed.wpPlaceSignatureInPaperbook ?? false,
        wpSignatureSizePx: parsed.wpSignatureSizePx ?? 120,
        slpMarginTopIn: parsed.slpMarginTopIn ?? 1.5,
        slpMarginRightIn: parsed.slpMarginRightIn ?? 1,
        slpMarginBottomIn: parsed.slpMarginBottomIn ?? 1,
        slpMarginLeftIn: parsed.slpMarginLeftIn ?? 1.5,
        wpMarginTopIn: parsed.wpMarginTopIn ?? 1.5,
        wpMarginRightIn: parsed.wpMarginRightIn ?? 1,
        wpMarginBottomIn: parsed.wpMarginBottomIn ?? 1,
        wpMarginLeftIn: parsed.wpMarginLeftIn ?? 1.5,
        wpOutputFont: parsed.wpOutputFont || 'Times New Roman',
        wpOutputFontSizePt: parsed.wpOutputFontSizePt ?? 14,
        wpOutputLineSpacing: parsed.wpOutputLineSpacing ?? 1.5,
        wpOutputParaBeforePt: parsed.wpOutputParaBeforePt ?? 0,
        wpOutputParaAfterPt: parsed.wpOutputParaAfterPt ?? 12,
        wpFiledByLeftPct: parsed.wpFiledByLeftPct ?? 40,
        wpFiledByLayout: normalizeWpFiledByLayout(parsed.wpFiledByLayout),
        wpStampFont: (['times', 'helvetica', 'courier'].includes(parsed.wpStampFont) ? parsed.wpStampFont : 'times') as 'times' | 'helvetica' | 'courier',
        wpPageNumberSizePt: parsed.wpPageNumberSizePt ?? 20,
        wpPageNumberMarginTopPt: parsed.wpPageNumberMarginTopPt ?? 54,
        wpPageNumberMarginRightPt: parsed.wpPageNumberMarginRightPt ?? 54,
        wpAnnexureLabelSizePt: parsed.wpAnnexureLabelSizePt ?? 14,
        wpAnnexureLabelMarginPt: parsed.wpAnnexureLabelMarginPt ?? 14.4,
        wpAnnexureLabelPosition: (parsed.wpAnnexureLabelPosition === 'right' ? 'right' : 'center') as 'center' | 'right',
        wpStampBackground: parsed.wpStampBackground ?? false,
        wpPlaceTrueCopyText: parsed.wpPlaceTrueCopyText ?? false,
        wpTrueCopyPosition: (parsed.wpTrueCopyPosition === 'center' ? 'center' : 'left') as 'left' | 'center',
        wpTrueCopyBackground: parsed.wpTrueCopyBackground ?? false,
        wpTrueCopyMarginXPt: parsed.wpTrueCopyMarginXPt ?? 36,
        wpTrueCopyMarginBottomPt: parsed.wpTrueCopyMarginBottomPt ?? 36,
        oaBench: parsed.oaBench || DEFAULT_OA_BENCH,
        oaFiledBy: {
          name: parsed.oaFiledBy?.name ?? "",
          firm: parsed.oaFiledBy?.firm ?? "",
          address: parsed.oaFiledBy?.address ?? "",
          enrolmentNo: parsed.oaFiledBy?.enrolmentNo ?? "",
          email: parsed.oaFiledBy?.email ?? "",
          phone: parsed.oaFiledBy?.phone ?? "",
        },
        oaFiledByLeftPct: parsed.oaFiledByLeftPct ?? 40,
        oaFiledByLayout: normalizeWpFiledByLayout(parsed.oaFiledByLayout),
        oaSignaturePng: parsed.oaSignaturePng ?? "",
        oaSignatureW: parsed.oaSignatureW ?? 0,
        oaSignatureH: parsed.oaSignatureH ?? 0,
        oaPlaceSignatureInPaperbook: parsed.oaPlaceSignatureInPaperbook ?? false,
        oaSignatureSizePx: parsed.oaSignatureSizePx ?? 120,
        oaStampFont: ['times', 'helvetica', 'courier'].includes(parsed.oaStampFont) ? parsed.oaStampFont : 'times',
        oaPageNumberSizePt: parsed.oaPageNumberSizePt ?? 20,
        oaPageNumberMarginTopPt: parsed.oaPageNumberMarginTopPt ?? 54,
        oaPageNumberMarginRightPt: parsed.oaPageNumberMarginRightPt ?? 54,
        oaAnnexureLabelSizePt: parsed.oaAnnexureLabelSizePt ?? 14,
        oaAnnexureLabelMarginPt: parsed.oaAnnexureLabelMarginPt ?? 14.4,
        oaAnnexureLabelPosition: (parsed.oaAnnexureLabelPosition === 'right' ? 'right' : 'center'),
        oaStampBackground: parsed.oaStampBackground ?? false,
        oaPlaceTrueCopyText: parsed.oaPlaceTrueCopyText ?? false,
        oaTrueCopyPosition: (parsed.oaTrueCopyPosition === 'center' ? 'center' : 'left'),
        oaTrueCopyBackground: parsed.oaTrueCopyBackground ?? false,
        oaTrueCopyMarginXPt: parsed.oaTrueCopyMarginXPt ?? 36,
        oaTrueCopyMarginBottomPt: parsed.oaTrueCopyMarginBottomPt ?? 36,
        oaMarginTopIn: parsed.oaMarginTopIn ?? 1.5,
        oaMarginRightIn: parsed.oaMarginRightIn ?? 1,
        oaMarginBottomIn: parsed.oaMarginBottomIn ?? 1,
        oaMarginLeftIn: parsed.oaMarginLeftIn ?? 1.5,
        oaOutputFont: parsed.oaOutputFont || 'Times New Roman',
        oaOutputFontSizePt: parsed.oaOutputFontSizePt ?? 14,
        oaOutputLineSpacing: parsed.oaOutputLineSpacing ?? 1.5,
        oaOutputParaBeforePt: parsed.oaOutputParaBeforePt ?? 0,
        oaOutputParaAfterPt: parsed.oaOutputParaAfterPt ?? 12,
        oaVakFontSizePt: parsed.oaVakFontSizePt ?? 11,
        oaVakLineSpacing: parsed.oaVakLineSpacing ?? 1,
        oaVakParaSpacingPt: parsed.oaVakParaSpacingPt ?? 4,
        wpVakFontSizePt: parsed.wpVakFontSizePt ?? 11,
        wpVakLineSpacing: parsed.wpVakLineSpacing ?? 1,
        wpVakParaSpacingPt: parsed.wpVakParaSpacingPt ?? 4,
        oaForceLastPageBreak: parsed.oaForceLastPageBreak ?? true,
      };
    } catch (err) {
      console.error("Failed to parse settings:", err);
    }
  }

  return defaults;
}

// ── One-time seed: SLP settings → other document types ──────────────────────
// Commercial users have only ever customised the SLP tool, so on the first
// launch after this update we copy their SLP settings into the corresponding
// keys for the other court/document types (currently the Writ Petition / HC
// keys). This only overwrites a target key that is STILL AT ITS DEFAULT — so a
// user who deliberately tuned a WP setting keeps it, and everyone else gets
// their SLP choices as the starting point until they diverge a type manually.
// Guarded by a flag so it runs exactly once; later per-type edits always stick.
//
// [slpKey, targetKey, targetDefault]
const SLP_TO_WP_SEED: [string, string, unknown][] = [
  // Document formatting
  ["outputFont", "wpOutputFont", "Times New Roman"],
  ["outputFontSizePt", "wpOutputFontSizePt", 14],
  ["outputLineSpacing", "wpOutputLineSpacing", 1.5],
  ["outputParaAfterPt", "wpOutputParaAfterPt", 12],
  // Page margins
  ["slpMarginTopIn", "wpMarginTopIn", 1.5],
  ["slpMarginRightIn", "wpMarginRightIn", 1],
  ["slpMarginBottomIn", "wpMarginBottomIn", 1],
  ["slpMarginLeftIn", "wpMarginLeftIn", 1.5],
  // Advocate signature
  ["aorSignaturePng", "wpSignaturePng", ""],
  ["aorSignatureW", "wpSignatureW", 0],
  ["aorSignatureH", "wpSignatureH", 0],
  ["signatureSizePx", "wpSignatureSizePx", 120],
  ["placeSignatureInPaperbook", "wpPlaceSignatureInPaperbook", false],
  // Annexure labelling
  ["annexureLabelSize", "wpAnnexureLabelSizePt", 14],
  ["annexureLabelMarginPt", "wpAnnexureLabelMarginPt", 14.4],
  // Pagination
  ["pageNumberSizePt", "wpPageNumberSizePt", 20],
  ["pageNumberMarginTopPt", "wpPageNumberMarginTopPt", 54],
  ["pageNumberMarginRightPt", "wpPageNumberMarginRightPt", 54],
  // True-copy stamp
  ["trueCopyMarginXPt", "wpTrueCopyMarginXPt", 36],
  ["trueCopyMarginBottomPt", "wpTrueCopyMarginBottomPt", 36],
  ["trueCopyPosition", "wpTrueCopyPosition", "left"],
  ["placeTrueCopyText", "wpPlaceTrueCopyText", false],
  ["trueCopyBackground", "wpTrueCopyBackground", false],
];

// [wpKey, oaKey, oaDefault] — the CAT settings start from the Writ Petition
// ones (the two courts format alike), then diverge as the user edits them.
const WP_TO_OA_SEED: [string, string, unknown][] = [
  ["wpOutputFont", "oaOutputFont", "Times New Roman"],
  ["wpOutputFontSizePt", "oaOutputFontSizePt", 14],
  ["wpOutputLineSpacing", "oaOutputLineSpacing", 1.5],
  ["wpOutputParaBeforePt", "oaOutputParaBeforePt", 0],
  ["wpOutputParaAfterPt", "oaOutputParaAfterPt", 12],
  ["wpMarginTopIn", "oaMarginTopIn", 1.5],
  ["wpMarginRightIn", "oaMarginRightIn", 1],
  ["wpMarginBottomIn", "oaMarginBottomIn", 1],
  ["wpMarginLeftIn", "oaMarginLeftIn", 1.5],
  ["wpFiledByLeftPct", "oaFiledByLeftPct", 40],
  ["wpStampFont", "oaStampFont", "times"],
  ["wpPageNumberSizePt", "oaPageNumberSizePt", 20],
  ["wpPageNumberMarginTopPt", "oaPageNumberMarginTopPt", 54],
  ["wpPageNumberMarginRightPt", "oaPageNumberMarginRightPt", 54],
  ["wpAnnexureLabelSizePt", "oaAnnexureLabelSizePt", 14],
  ["wpAnnexureLabelMarginPt", "oaAnnexureLabelMarginPt", 14.4],
  ["wpAnnexureLabelPosition", "oaAnnexureLabelPosition", "center"],
  ["wpStampBackground", "oaStampBackground", false],
  ["wpTrueCopyPosition", "oaTrueCopyPosition", "left"],
  ["wpTrueCopyBackground", "oaTrueCopyBackground", false],
  ["wpTrueCopyMarginXPt", "oaTrueCopyMarginXPt", 36],
  ["wpTrueCopyMarginBottomPt", "oaTrueCopyMarginBottomPt", 36],
];

export function seedSettingsFromWpOnce() {
  if (typeof window === "undefined") return;
  const FLAG = "drafto-settings-seeded-wp-to-oa-v1";
  try {
    if (localStorage.getItem(FLAG)) return;
    if (localStorage.getItem(SETTINGS_KEY)) {
      const cur = getSettings() as unknown as Record<string, unknown>;
      let changed = false;
      for (const [wpKey, oaKey, oaDefault] of WP_TO_OA_SEED) {
        if (cur[oaKey] === oaDefault && cur[wpKey] !== undefined) {
          cur[oaKey] = cur[wpKey];
          changed = true;
        }
      }
      if (changed) localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
    }
    localStorage.setItem(FLAG, "1");
  } catch (err) {
    console.error("CAT settings seed failed:", err);
  }
}

export function seedSettingsFromSlpOnce() {
  if (typeof window === "undefined") return;
  const FLAG = "drafto-settings-seeded-from-slp-v1";
  try {
    if (localStorage.getItem(FLAG)) return;
    // Only meaningful for users with existing (customised) settings; a fresh
    // install starts at defaults everywhere.
    if (localStorage.getItem(SETTINGS_KEY)) {
      const cur = getSettings() as unknown as Record<string, unknown>;
      let changed = false;
      for (const [slpKey, targetKey, targetDefault] of SLP_TO_WP_SEED) {
        if (cur[targetKey] === targetDefault && cur[slpKey] !== undefined) {
          cur[targetKey] = cur[slpKey];
          changed = true;
        }
      }
      if (changed) localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
    }
    localStorage.setItem(FLAG, "1");
  } catch (err) {
    console.error("Settings seed failed:", err);
  }
}

// Initialize font size on app load
if (typeof window !== "undefined") {
  seedSettingsFromSlpOnce();
  seedSettingsFromWpOnce();
  const settings = getSettings();
  applyUiFont(settings.uiFont);
  applyUiFontSize(settings.uiFontSize);
  applyInputFont(settings.inputFont);
  applyInputFontSize(settings.inputFontSize);
}

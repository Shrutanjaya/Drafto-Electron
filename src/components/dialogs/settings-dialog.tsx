import React, { useState, useEffect, useRef } from "react";
import { Settings, FolderOpen, RefreshCw, ExternalLink, Moon, Sun, Download, CheckCircle, AlertCircle, Loader2, Info, Sparkles, XCircle, ChevronRight } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { getGenerationCounts, type UsageCounts } from "@/lib/firebase/usage-service";
import { WP_NUMBER_STYLES, DEFAULT_WP_NUMBERING, type WpNumbering, DEFAULT_WP_FILED_BY, type WpFiledBy } from "@/lib/wp/wp-settings";
import type { EnumStyle } from "@/lib/wp/wp-numbering";
import { LICENSE_TEXT, TERMS_TEXT } from "@/lib/legal";
import { cn } from "@/lib/utils";

type SlpTabView = 'splitter' | 'navigation';
type QuoteLineSpacing = 'default' | 'single';
type TrueCopyPosition = 'left' | 'center';
type AiModel = 'default' | 'haiku' | 'sonnet' | 'opus';
type SettingsSection = 'appearance' | 'workspace' | 'formatting' | 'writpetition' | 'paperbook' | 'userdefaults' | 'customize' | 'save' | 'shortcuts' | 'support';

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

function SettingsNavRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
        selected
          ? "bg-primary text-primary-foreground dark:text-white font-medium"
          : "hover:bg-muted text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('appearance');
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
    aiPluginEnabled: false,
    aiClaudeBinaryPath: "",
    aiModel: 'default',
    defaultAorName: "",
    defaultAorCode: "",
    wpNumbering: DEFAULT_WP_NUMBERING,
    wpFiledBy: DEFAULT_WP_FILED_BY,
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

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      img.onload = () => {
        setSettings((prev) => ({
          ...prev,
          aorSignaturePng: dataUrl,
          aorSignatureW: img.naturalWidth,
          aorSignatureH: img.naturalHeight,
        }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl flex flex-col" style={{ height: 'min(520px, calc(100vh - 4rem))' }}>
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        {/* Split layout */}
        <div className="flex flex-1 min-h-0 rounded-lg border overflow-hidden">
          {/* Left nav */}
          <div className="w-36 shrink-0 border-r flex flex-col p-2 space-y-0.5 bg-muted/30">
            <SettingsNavRow label="Appearance" selected={selectedSection === 'appearance'} onClick={() => setSelectedSection('appearance')} />
            <SettingsNavRow label="Workspace" selected={selectedSection === 'workspace'} onClick={() => setSelectedSection('workspace')} />
            <SettingsNavRow label="Formatting" selected={selectedSection === 'formatting'} onClick={() => setSelectedSection('formatting')} />
            <SettingsNavRow label="Writ Petition (DHC)" selected={selectedSection === 'writpetition'} onClick={() => setSelectedSection('writpetition')} />
            <SettingsNavRow label="Paperbook" selected={selectedSection === 'paperbook'} onClick={() => setSelectedSection('paperbook')} />
            <SettingsNavRow label="User Defaults" selected={selectedSection === 'userdefaults'} onClick={() => setSelectedSection('userdefaults')} />
            <SettingsNavRow label="Mayur (AI)" selected={selectedSection === 'customize'} onClick={() => setSelectedSection('customize')} />
            <SettingsNavRow label="Save Locations" selected={selectedSection === 'save'} onClick={() => setSelectedSection('save')} />
            <SettingsNavRow label="Shortcuts" selected={selectedSection === 'shortcuts'} onClick={() => setSelectedSection('shortcuts')} />
            <SettingsNavRow label="Support" selected={selectedSection === 'support'} onClick={() => setSelectedSection('support')} />
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── APPEARANCE ── */}
            {selectedSection === 'appearance' && (
              <div className="space-y-4">
                {/* Theme */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Mode</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={theme === 'light' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setTheme('light')}
                    >
                      <Sun className="h-3.5 w-3.5" /> Light
                    </Button>
                    <Button
                      type="button"
                      variant={theme === 'dark' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setTheme('dark')}
                    >
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </Button>
                  </div>
                </div>

                {/* Interface Font + Size */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Interface Font</p>
                  <p className="text-xs text-muted-foreground">Font &amp; text size used across Drafto's interface. Does not affect the generated document.</p>
                  <div className="flex gap-2">
                    <Select
                      value={settings.uiFont}
                      onValueChange={(value) => { setSettings((prev) => ({ ...prev, uiFont: value })); applyUiFont(value); }}
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs" style={{ fontFamily: settings.uiFont }}>
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
                      <SelectTrigger className="h-8 w-[90px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UI_FONT_SIZES.map((s) => (
                          <SelectItem key={s} value={String(s)} className="text-xs">{s} px</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Editing Font + Size */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Editing Font</p>
                  <p className="text-xs text-muted-foreground">Font &amp; text size for the text you type — form fields and the rich-text editor. For the best view, keep this at or below the interface size. Does not affect the generated document.</p>
                  <div className="flex gap-2">
                    <Select
                      value={settings.inputFont}
                      onValueChange={(value) => { setSettings((prev) => ({ ...prev, inputFont: value })); applyInputFont(value); }}
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs" style={{ fontFamily: settings.inputFont }}>
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
                      <SelectTrigger className="h-8 w-[90px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INPUT_FONT_SIZES.map((s) => (
                          <SelectItem key={s} value={String(s)} className="text-xs">{s} px</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Restore Appearance Defaults */}
                <div className="pt-1">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={restoreAppearanceDefaults}>
                    Restore Defaults
                  </Button>
                  <p className="mt-1 text-[10px] text-muted-foreground">Resets Mode, Fonts and Sizes to Light, Arial, 16&nbsp;px (interface) and 12&nbsp;px (editing). Click Save to keep.</p>
                </div>
              </div>
            )}

            {/* ── USER DEFAULTS ── */}
            {selectedSection === 'userdefaults' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  These values are filled into every new project automatically — including the blank project created when Drafto launches. Changing them here does not alter projects you've already created.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="default-aor-name" className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">AoR Name</Label>
                  <Input
                    id="default-aor-name"
                    value={settings.defaultAorName}
                    onChange={(e) => setSettings((prev) => ({ ...prev, defaultAorName: e.target.value }))}
                    placeholder="Advocate-on-Record name"
                    className="h-7 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="default-aor-code" className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">AoR Code</Label>
                  <Input
                    id="default-aor-code"
                    value={settings.defaultAorCode}
                    onChange={(e) => setSettings((prev) => ({ ...prev, defaultAorCode: e.target.value }))}
                    placeholder="AoR registration code"
                    className="h-7 text-xs"
                  />
                </div>

                <p className="text-[10px] text-muted-foreground italic">
                  The AI assistant will not overwrite these fields unless you explicitly ask it to.
                </p>
              </div>
            )}

            {/* ── CUSTOMIZE ── */}
            {selectedSection === 'customize' && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Mayur</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Beta</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium">Mayur</span> is Drafto's drafting assistant. Drafto itself provides no AI — Mayur runs on your own <span className="font-medium">Claude Code</span> subscription, appearing as a chat box at the bottom-right of Drafto. Talk to it, or point it at a folder of raw PDFs and ask it to help fill in your project. Your credentials never leave your machine — Drafto runs the <code className="px-1 rounded bg-muted text-[11px]">claude</code> command you already have installed. Neither Quindoph nor the developer is liable for any data you share to Claude CLI through Mayur. Drafto neither captures nor stores the said data which is processed by Claude alone.
                  </p>

                  <p className="text-xs font-bold text-foreground leading-relaxed">
                    By using Mayur AI, you agree that you are fully responsible for the content generated by Mayur AI, and shall hold neither the developer nor Quindoph Legal Solutions Pvt. Ltd. liable for any such content. You agree that nothing generated by Mayur AI shall be used or filed by you without independent vetting and verification. You further agree that Mayur is currently in its Beta/experimental phase and its outputs may be erratic, and also that it requires a pre-existing Claude CLI Installation and Claude Pro or Max Subscription.
                  </p>

                  {/* Enable toggle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ai-plugin-enabled"
                      checked={settings.aiPluginEnabled}
                      onChange={(e) => setSettings((prev) => ({ ...prev, aiPluginEnabled: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                    />
                    <Label htmlFor="ai-plugin-enabled" className="text-xs font-normal cursor-pointer text-muted-foreground">
                      Enable Mayur (the chat box in Drafto)
                    </Label>
                  </div>

                  {settings.aiPluginEnabled && (
                    <div className="space-y-3 pl-6 border-l border-border ml-1.5">
                      {/* Prerequisites status */}
                      <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">Prerequisites</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 text-[11px] px-2"
                            onClick={checkAiPrereqs}
                            disabled={aiChecking}
                          >
                            {aiChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            {aiChecking ? "Checking…" : "Re-check"}
                          </Button>
                        </div>

                        {aiPrereq === null && !aiChecking && (
                          <p className="text-[11px] text-muted-foreground">Click "Re-check" to scan your machine.</p>
                        )}

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
                                detail={aiPrereq.loggedIn ? "authenticated" : "not signed in — use the Sign in button below"}
                              />
                            )}

                            {!aiPrereq.claude.found ? (
                              <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> Install Claude Code (step 1 below), then Re-check.
                              </p>
                            ) : aiPrereq.loggedIn !== true ? (
                              <div className="pt-1 space-y-1.5">
                                <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1">
                                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span>Claude Code is installed but not signed in. Click below — it opens a Terminal and your browser to sign in. If the browser didn't open last time, click it again.</span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={handleAiLogin}>
                                    <Sparkles className="h-3.5 w-3.5" /> Sign in to Claude Code
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={handleRelaunch}>
                                    <RefreshCw className="h-3.5 w-3.5" /> Relaunch Drafto
                                  </Button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">After signing in, if Mayur still shows as not ready, click Relaunch Drafto.</p>
                              </div>
                            ) : (
                              <div className="pt-1 space-y-1.5">
                                <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> Ready — the AI assistant is connected and signed in.
                                </p>
                                <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 text-[10px] text-muted-foreground px-1.5" onClick={handleAiLogin}>
                                  <Sparkles className="h-3 w-3" /> Sign in again
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Installation (collapsible — declutter once set up) */}
                      <button
                        type="button"
                        onClick={() => setInstallOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide hover:text-foreground"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", installOpen && "rotate-90")} />
                        Installation
                      </button>
                      {installOpen && (
                      <div className="space-y-3">
                      {/* One-click install */}
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                        <p className="text-[11px] text-foreground leading-relaxed">
                          <span className="font-medium">Don't have Claude Code yet?</span> Install it in one click — Drafto runs Anthropic's official installer for you, then opens sign-in.
                        </p>
                        {installState !== 'running' && !showInstallConsent && installState !== 'done' && (
                          <Button type="button" size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => setShowInstallConsent(true)}>
                            <Download className="h-3.5 w-3.5" /> Install Claude Code (one-click)
                          </Button>
                        )}
                        {showInstallConsent && installState !== 'running' && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] text-foreground leading-relaxed">
                              <span className="font-semibold">Before you proceed —</span> Drafto will download and run Anthropic's official Claude Code installer (from <code className="px-1 rounded bg-muted text-[10px]">claude.ai</code>) on your computer. It installs the <code className="px-1 rounded bg-muted text-[10px]">claude</code> command in your user account (no admin rights), and needs an internet connection. Afterwards you'll sign in with your own Claude account (Pro/Max plan or API credits) in your browser — your credentials never go to Drafto. Proceed?
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
                            <div className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400"><CheckCircle className="h-3.5 w-3.5" /> Installed. Next: sign in, then relaunch Drafto.</div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">If the sign-in browser didn't open, click Sign in. Once signed in, Relaunch Drafto so it picks up the newly installed CLI.</p>
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
                          <pre className="max-h-32 overflow-auto rounded bg-muted/60 p-1.5 text-[10px] leading-snug whitespace-pre-wrap break-words">{installLog.join("\n")}</pre>
                        )}
                      </div>

                      {/* What the user must install (manual fallback) */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Prefer to do it yourself?</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">Already use Claude Code? You can skip step 1 — just make sure it's logged in (step 2).</p>
                        <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal pl-4 leading-relaxed">
                          <li>
                            <span className="font-medium text-foreground">Claude Code CLI.</span> Recommended install (no admin rights needed):
                            <code className="block mt-0.5 px-1.5 py-1 rounded bg-muted text-[11px] select-all">curl -fsSL https://claude.ai/install.sh | bash</code>
                            <span className="block mt-0.5">
                              Prefer npm? <code className="px-1 rounded bg-muted text-[11px] select-all">npm install -g @anthropic-ai/claude-code</code> — but if it fails with a "permission denied / EACCES" error, use the installer above instead (it avoids the system folder that causes that).
                            </span>
                          </li>
                          <li>
                            <span className="font-medium text-foreground">Sign in to Claude Code.</span> Easiest: use the <span className="font-medium">Sign in to Claude Code</span> button that appears above when you're not signed in — it opens a Terminal and runs the sign-in for you, then your browser opens to approve it.
                            <span className="block mt-0.5">
                              To do it by hand instead: open the macOS <span className="font-medium text-foreground">Terminal</span> app (⌘Space, type "Terminal", Enter), then run:
                            </span>
                            <code className="block mt-0.5 px-1.5 py-1 rounded bg-muted text-[11px] select-all">claude auth login</code>
                            <span className="block mt-0.5">and follow the browser prompt. (Requires an active Claude Pro/Max plan or API credits.) Note: signing in through the Claude Desktop app does <span className="italic">not</span> count — this CLI needs its own sign-in.</span>
                          </li>
                          <li>An <span className="font-medium text-foreground">internet connection</span> (the CLI talks to Anthropic).</li>
                        </ol>
                      </div>

                      {/* Optional binary path override */}
                      <div className="space-y-1.5">
                        <Label htmlFor="ai-claude-path" className="text-xs text-muted-foreground">
                          <code className="text-[11px]">claude</code> binary path <span className="text-[10px]">(optional — leave blank to auto-detect)</span>
                        </Label>
                        <Input
                          id="ai-claude-path"
                          value={settings.aiClaudeBinaryPath}
                          onChange={(e) => setSettings((prev) => ({ ...prev, aiClaudeBinaryPath: e.target.value }))}
                          placeholder={settings.aiClaudeBinaryPath ? "" : "e.g. /opt/homebrew/bin/claude"}
                          className="h-7 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">Set this only if Drafto can't find <code className="text-[10px]">claude</code> automatically.</p>
                      </div>
                      </div>
                      )}

                      {/* Model selector */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Model</Label>
                        <Select
                          value={settings.aiModel}
                          onValueChange={(v: AiModel) => setSettings((prev) => ({ ...prev, aiModel: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default" className="text-xs">Default (your CLI's model)</SelectItem>
                            <SelectItem value="haiku" className="text-xs">Haiku — fastest, lightest usage</SelectItem>
                            <SelectItem value="sonnet" className="text-xs">Sonnet — balanced (recommended)</SelectItem>
                            <SelectItem value="opus" className="text-xs">Opus — strongest, heaviest usage</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          Leave on <span className="font-medium">Default</span> and each task picks a sensible model automatically (Haiku for extraction like Memo/List of Dates, Sonnet for drafting like Grounds). Choose a specific model here to override that for every task. A bigger model uses your Claude allowance faster, and Opus may require a Max plan.
                        </p>
                      </div>

                      <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                        Pro-Tip: The assistant can read files you point it to and suggest field values, but it will not overwrite your work without your confirmation. Always review its suggestions before saving.
                      </p>
                    </div>
                  )}
                </div>
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

            {/* ── WORKSPACE ── */}
            {selectedSection === 'workspace' && (
              <div className="space-y-4">
                {/* Default Petition View — controls the default on new project; real-time switching via the header toggle */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Default Petition View</p>
                  <p className="text-xs text-muted-foreground">Applied when creating a new project. Use the Split / Nav toggle in the toolbar to switch views on the fly.</p>
                  <RadioGroup
                    value={settings.slpTabView}
                    onValueChange={(value: SlpTabView) => setSettings((prev) => ({ ...prev, slpTabView: value }))}
                    className="flex gap-3"
                  >
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="splitter" id="slp-view-splitter" />
                      <Label htmlFor="slp-view-splitter" className="text-xs font-normal cursor-pointer">Splitter</Label>
                    </div>
                    <div className="flex items-center gap-1">
                      <RadioGroupItem value="navigation" id="slp-view-navigation" />
                      <Label htmlFor="slp-view-navigation" className="text-xs font-normal cursor-pointer">Navigation</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Notifications</p>
                  <p className="text-xs text-muted-foreground">How long pop-up messages stay on screen.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="toast-duration"
                      type="number"
                      min={1}
                      step={1}
                      value={settings.toastDuration}
                      onChange={(e) => setSettings((prev) => ({ ...prev, toastDuration: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="h-7 w-16 text-xs text-right"
                    />
                    <Label htmlFor="toast-duration" className="text-xs text-muted-foreground">seconds</Label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Autosave Interval</p>
                  <div className="flex items-center gap-2">
                    <Input
                      id="autosave-interval"
                      type="number"
                      min={0}
                      step={10}
                      value={settings.autosaveInterval}
                      onChange={(e) => setSettings((prev) => ({ ...prev, autosaveInterval: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="h-7 w-16 text-xs text-right"
                    />
                    <Label htmlFor="autosave-interval" className="text-xs text-muted-foreground">seconds (0 = disabled)</Label>
                  </div>
                </div>
              </div>
            )}

            {/* ── DOCUMENT FORMATTING ── */}
            {selectedSection === 'formatting' && (
              <div className="space-y-6">

                {/* Output Text Formatting */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Output Text Formatting</p>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="About output formatting">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[280px] text-xs font-normal leading-relaxed whitespace-pre-line">
                          For best results, Times New Roman at 14&nbsp;pt with 1.5 line spacing and 12&nbsp;pt after-paragraph spacing is strongly recommended.
                          {"\n\n"}
                          To preserve the paperbook structure, these settings are not fully reflected in the Cover Page, Listing Proforma, Index and Office Report on Limitation — only the font type is applied to those sections; their size and spacing remain fixed.
                          {"\n\n"}
                          Also, please make sure the chosen font is installed on your computer. If it isn't, the document may appear in a different, substitute font.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground">Font, size and spacing applied to the body text of the generated SLP. (Defaults: Times New Roman, 14&nbsp;pt, 1.5&nbsp;line spacing, 12&nbsp;pt after each paragraph.)</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Font</Label>
                      <Select
                        value={settings.outputFont}
                        onValueChange={(v) => setSettings((prev) => ({ ...prev, outputFont: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OUTPUT_FONTS.map((f) => (
                            <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Font size (pt)</Label>
                      <Input
                        type="number"
                        min={8}
                        max={24}
                        step={0.5}
                        value={settings.outputFontSizePt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, outputFontSizePt: Math.min(24, Math.max(8, parseFloat(e.target.value) || 14)) }))}
                        className="h-7 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Line spacing</Label>
                      <Select
                        value={String(settings.outputLineSpacing)}
                        onValueChange={(v) => setSettings((prev) => ({ ...prev, outputLineSpacing: parseFloat(v) }))}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1" className="text-xs">Single (1.0)</SelectItem>
                          <SelectItem value="1.15" className="text-xs">1.15</SelectItem>
                          <SelectItem value="1.5" className="text-xs">1.5</SelectItem>
                          <SelectItem value="2" className="text-xs">Double (2.0)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Spacing after each paragraph (pt)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={36}
                        step={1}
                        value={settings.outputParaAfterPt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, outputParaAfterPt: Math.min(36, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Quotes */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Quotes</p>
                  <p className="text-xs text-muted-foreground">Line spacing applied to text formatted as a Quote. Quoted blocks are wrapped in quotation marks and italicised on export.</p>
                  <RadioGroup
                    value={settings.quoteLineSpacing}
                    onValueChange={(value: QuoteLineSpacing) => setSettings((prev) => ({ ...prev, quoteLineSpacing: value }))}
                    className="flex gap-4 pt-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="default" id="quote-spacing-default" />
                      <Label htmlFor="quote-spacing-default" className="text-xs font-normal cursor-pointer">Default spacing</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="single" id="quote-spacing-single" />
                      <Label htmlFor="quote-spacing-single" className="text-xs font-normal cursor-pointer">Single spacing</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Export Highlights */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Highlights</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="export-highlight"
                      checked={settings.exportHighlight}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSettings((prev) => ({ ...prev, exportHighlight: checked }));
                        // Persist immediately so parseHtml reads the correct value at export time
                        try {
                          const stored = localStorage.getItem(SETTINGS_KEY);
                          const existing = stored ? JSON.parse(stored) : {};
                          localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, exportHighlight: checked }));
                        } catch {}
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                    />
                    <Label htmlFor="export-highlight" className="text-xs font-normal cursor-pointer text-muted-foreground">
                      Export text highlights to DOCX and PDF (off = highlights stay on-screen only)
                    </Label>
                  </div>
                </div>

              </div>
            )}

            {/* ── WRIT PETITION (DHC) ── */}
            {selectedSection === 'writpetition' && (
              <div className="space-y-6">
                {/* Filed-by defaults */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">“Filed by” defaults</p>
                  <p className="text-xs text-muted-foreground">Pre-filled into the “Filed by” block of every new writ petition, so you don’t re-enter them each time. Per-petition edits in the Preliminary tab override these.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["name", "Advocate name"],
                      ["firm", "Firm / Chamber"],
                      ["enrolmentNo", "Enrolment No."],
                      ["phone", "Phone"],
                      ["email", "Email"],
                    ] as [keyof WpFiledBy, string][]).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Input
                          className="h-7 text-xs"
                          value={settings.wpFiledBy?.[key] ?? ""}
                          onChange={(e) => setSettings((prev) => ({ ...prev, wpFiledBy: { ...(prev.wpFiledBy ?? DEFAULT_WP_FILED_BY), [key]: e.target.value } }))}
                        />
                      </div>
                    ))}
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Address</Label>
                      <Textarea
                        rows={2}
                        className="text-xs"
                        value={settings.wpFiledBy?.address ?? ""}
                        onChange={(e) => setSettings((prev) => ({ ...prev, wpFiledBy: { ...(prev.wpFiledBy ?? DEFAULT_WP_FILED_BY), address: e.target.value } }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-paragraph numbering */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-slate-300">Sub-paragraph numbering</p>
                  <p className="text-xs text-muted-foreground">First-level lettering for each section. Deeper levels follow a fixed cascade automatically.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      ["facts", "Facts"],
                      ["grounds", "Grounds"],
                      ["prayers", "Prayers"],
                    ] as [keyof WpNumbering, string][]).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Select
                          value={settings.wpNumbering?.[key] ?? DEFAULT_WP_NUMBERING[key]}
                          onValueChange={(v) => setSettings((prev) => ({ ...prev, wpNumbering: { ...(prev.wpNumbering ?? DEFAULT_WP_NUMBERING), [key]: v as EnumStyle } }))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WP_NUMBER_STYLES.map((s) => (
                              <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── PAPERBOOK ── */}
            {selectedSection === 'paperbook' && (
              <div className="space-y-6">

                {/* Annexure Labels */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Annexure Labels</p>
                  <p className="text-xs text-muted-foreground">The "Annexure P-X" label stamped on the first page of each annexure.</p>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="annexure-bg"
                      checked={settings.annexureLabelBackground}
                      onChange={(e) => setSettings((prev) => ({ ...prev, annexureLabelBackground: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                    />
                    <Label htmlFor="annexure-bg" className="text-xs font-normal cursor-pointer text-muted-foreground">
                      Add white background behind Annexure Labels (also applies to Page Numbers)
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Label text size</Label>
                      <span className="text-xs font-semibold tabular-nums w-6 text-right">{settings.annexureLabelSize}</span>
                    </div>
                    <Slider
                      min={10}
                      max={24}
                      step={1}
                      value={[settings.annexureLabelSize]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, annexureLabelSize: v }))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>10</span><span>Default: 14</span><span>24</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label margin from top edge (pt)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={144}
                      step={1}
                      value={settings.annexureLabelMarginPt}
                      onChange={(e) => setSettings((prev) => ({ ...prev, annexureLabelMarginPt: Math.min(144, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                      className="h-7 text-xs w-28"
                    />
                    <p className="text-[10px] text-muted-foreground">Default: 14.4 pt (0.2 inch). 72 pt = 1 inch.</p>
                  </div>
                </div>

                {/* Page Numbers */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Page Numbers</p>
                  <p className="text-xs text-muted-foreground">Size and position of the page numbers stamped on the top-right of each paginated page.</p>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Text size (pt)</Label>
                      <Input
                        type="number"
                        min={8}
                        max={36}
                        step={1}
                        value={settings.pageNumberSizePt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, pageNumberSizePt: Math.min(36, Math.max(8, parseFloat(e.target.value) || 20)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Top margin (pt)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={216}
                        step={1}
                        value={settings.pageNumberMarginTopPt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, pageNumberMarginTopPt: Math.min(216, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Right margin (pt)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={216}
                        step={1}
                        value={settings.pageNumberMarginRightPt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, pageNumberMarginRightPt: Math.min(216, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Defaults: 20 pt size, 54 pt (0.75 inch) top and right margins.</p>
                </div>

                {/* Advocate's Checklist */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Advocate's Checklist</p>
                  <p className="text-xs text-muted-foreground">Tighten these to keep the checklist from spilling over several pages in the PDF paperbook.</p>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Font size (pt)</Label>
                      <Input
                        type="number"
                        min={6}
                        max={18}
                        step={0.5}
                        value={settings.checklistFontSizePt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, checklistFontSizePt: Math.min(18, Math.max(6, parseFloat(e.target.value) || 14)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Line spacing</Label>
                      <Select
                        value={String(settings.checklistLineSpacing)}
                        onValueChange={(v) => setSettings((prev) => ({ ...prev, checklistLineSpacing: parseFloat(v) }))}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1" className="text-xs">Single (1.0)</SelectItem>
                          <SelectItem value="1.15" className="text-xs">1.15</SelectItem>
                          <SelectItem value="1.5" className="text-xs">1.5</SelectItem>
                          <SelectItem value="2" className="text-xs">Double (2.0)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Para spacing (pt)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={18}
                        step={1}
                        value={settings.checklistParaSpacingPt}
                        onChange={(e) => setSettings((prev) => ({ ...prev, checklistParaSpacingPt: Math.min(18, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Defaults: 14 pt font, 1.5 line spacing, 6 pt paragraph spacing.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Top margin (inches)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={settings.checklistMarginTopInches}
                        onChange={(e) => setSettings((prev) => ({ ...prev, checklistMarginTopInches: Math.min(2, Math.max(0.5, parseFloat(e.target.value) || 1)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Left margin (inches)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={settings.checklistMarginLeftInches}
                        onChange={(e) => setSettings((prev) => ({ ...prev, checklistMarginLeftInches: Math.min(2, Math.max(0.5, parseFloat(e.target.value) || 1)) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Defaults: 1 inch top and left. Set to 1.5 to match the other documents.</p>
                </div>

                {/* Volume Splitting */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Volume Splitting</p>
                  <p className="text-xs text-muted-foreground">Paperbooks exceeding the first threshold are automatically split into volumes. Each additional threshold adds another volume.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">First threshold (pages)</Label>
                      <Input
                        type="number"
                        min={100}
                        step={50}
                        value={settings.volumeSplitThreshold}
                        onChange={(e) => setSettings((prev) => ({ ...prev, volumeSplitThreshold: Math.max(100, parseInt(e.target.value) || 400) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Subsequent step (pages)</Label>
                      <Input
                        type="number"
                        min={50}
                        step={50}
                        value={settings.volumeStepSize}
                        onChange={(e) => setSettings((prev) => ({ ...prev, volumeStepSize: Math.max(50, parseInt(e.target.value) || 200) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedVolume((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAdvancedVolume ? "Hide advanced options" : "Show advanced options"}
                  </button>

                  {showAdvancedVolume && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Keep components ≤ ___ pages intact across volume boundaries</Label>
                      <Input
                        type="number"
                        min={1}
                        step={5}
                        value={settings.maxComponentSplitPages}
                        onChange={(e) => setSettings((prev) => ({ ...prev, maxComponentSplitPages: Math.max(1, parseInt(e.target.value) || 50) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Retain in current volume if ≤ ___ pages would spill over</Label>
                      <Input
                        type="number"
                        min={1}
                        step={5}
                        value={settings.minVolumeTailPages}
                        onChange={(e) => setSettings((prev) => ({ ...prev, minVolumeTailPages: Math.max(1, parseInt(e.target.value) || 20) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Push to next volume if ≤ ___ pages would remain in current</Label>
                      <Input
                        type="number"
                        min={1}
                        step={5}
                        value={settings.minVolumeHeadPages}
                        onChange={(e) => setSettings((prev) => ({ ...prev, minVolumeHeadPages: Math.max(1, parseInt(e.target.value) || 20) }))}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Output format</Label>
                      <RadioGroup
                        value={settings.separateVolumePdfs ? 'separate' : 'consolidated'}
                        onValueChange={(v) => setSettings((prev) => ({ ...prev, separateVolumePdfs: v === 'separate' }))}
                        className="flex gap-4 pt-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="separate" id="vol-separate" />
                          <Label htmlFor="vol-separate" className="text-xs font-normal cursor-pointer">Separate PDFs per volume</Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="consolidated" id="vol-consolidated" />
                          <Label htmlFor="vol-consolidated" className="text-xs font-normal cursor-pointer">Single consolidated PDF</Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                  )}
                </div>

                {/* AoR Signature & True Copy (Beta) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">AoR Signature &amp; True Copy</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Beta</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The signature is placed above the AoR's name in every "Filed&nbsp;by" block. The True Copy mark (a small signature above the words "True&nbsp;Copy") is stamped at the bottom-left of every annexure page.
                  </p>
                  <p className="text-xs text-muted-foreground italic">
                    Pro-Tip: For the cleanest appearance, use a signature with a transparent background and minimal white margins.
                  </p>

                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20 p-2.5">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Important
                    </p>
                    <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1 leading-relaxed">
                      Please note that Drafto merely assists you in collating the paperbook and electronically placing your signatures on it. The responsibility for the contents of the paperbook continues to rest with you, and we urge you to examine the paperbook comprehensively before it is filed.
                    </p>
                  </div>

                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />

                  <div className="flex items-center gap-3">
                    {settings.aorSignaturePng ? (
                      <div className="flex items-center justify-center border rounded bg-white p-1" style={{ width: 96, height: 48 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={settings.aorSignaturePng} alt="AoR signature" className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center border border-dashed rounded text-[10px] text-muted-foreground" style={{ width: 96, height: 48 }}>
                        No signature
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => signatureInputRef.current?.click()}>
                        {settings.aorSignaturePng ? "Replace PNG" : "Upload PNG"}
                      </Button>
                      {settings.aorSignaturePng && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setSettings((prev) => ({ ...prev, aorSignaturePng: "", aorSignatureW: 0, aorSignatureH: 0 }))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="place-signature"
                      checked={settings.placeSignatureInPaperbook}
                      disabled={!settings.aorSignaturePng}
                      onChange={(e) => setSettings((prev) => ({ ...prev, placeSignatureInPaperbook: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-gray-300 shrink-0 disabled:opacity-40"
                    />
                    <Label htmlFor="place-signature" className="text-xs font-normal cursor-pointer text-muted-foreground">
                      Place AoR signature above the name in every "Filed by" block
                    </Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="place-truecopy"
                      checked={settings.placeTrueCopyText}
                      disabled={!settings.aorSignaturePng}
                      onChange={(e) => setSettings((prev) => ({ ...prev, placeTrueCopyText: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-gray-300 shrink-0 disabled:opacity-40"
                    />
                    <Label htmlFor="place-truecopy" className="text-xs font-normal cursor-pointer text-muted-foreground">
                      Stamp "True Copy" (with small signature) on every annexure page
                    </Label>
                  </div>

                  {settings.placeTrueCopyText && (
                    <div className="space-y-3 pl-6 border-l border-border ml-1.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">True Copy position</Label>
                        <RadioGroup
                          value={settings.trueCopyPosition}
                          onValueChange={(value: TrueCopyPosition) => setSettings((prev) => ({ ...prev, trueCopyPosition: value }))}
                          className="flex gap-4 pt-0.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="left" id="truecopy-left" />
                            <Label htmlFor="truecopy-left" className="text-xs font-normal cursor-pointer">Bottom-left</Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="center" id="truecopy-center" />
                            <Label htmlFor="truecopy-center" className="text-xs font-normal cursor-pointer">Bottom-centre</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="truecopy-bg"
                          checked={settings.trueCopyBackground}
                          onChange={(e) => setSettings((prev) => ({ ...prev, trueCopyBackground: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                        />
                        <Label htmlFor="truecopy-bg" className="text-xs font-normal cursor-pointer text-muted-foreground">
                          Add white background behind the True Copy stamp
                        </Label>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Horizontal margin (pt)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={216}
                            step={1}
                            value={settings.trueCopyMarginXPt}
                            onChange={(e) => setSettings((prev) => ({ ...prev, trueCopyMarginXPt: Math.min(216, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Bottom margin (pt)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={216}
                            step={1}
                            value={settings.trueCopyMarginBottomPt}
                            onChange={(e) => setSettings((prev) => ({ ...prev, trueCopyMarginBottomPt: Math.min(216, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Defaults: 36 pt (0.5 inch) on both. In bottom-centre mode the horizontal margin is ignored.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Signature width</Label>
                      <span className="text-xs font-semibold tabular-nums w-12 text-right">{settings.signatureSizePx}&nbsp;px</span>
                    </div>
                    <Slider
                      min={48}
                      max={240}
                      step={4}
                      value={[settings.signatureSizePx]}
                      onValueChange={([v]) => setSettings((prev) => ({ ...prev, signatureSizePx: v }))}
                      className="w-full"
                    />
                    {settings.aorSignaturePng && settings.aorSignatureW > 0 && (
                      <div className="flex items-center justify-center border rounded bg-white p-2 mt-1">
                        {/* Live size preview at the chosen width */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    <p className="text-[10px] text-muted-foreground">The True Copy signature is rendered at half this width.</p>
                  </div>
                </div>

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
                {/* Usage counts */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Your Usage</p>
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border">
                    <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.paperbooksGenerated}</span>
                    <span className="text-xs text-muted-foreground">Paperbooks (PDFs),</span>
                    <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.docxGenerated}</span>
                    <span className="text-xs text-muted-foreground">Drafts (Docx)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Updates</p>
                  {updateStatus === 'idle' && (
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleUpdate}>
                      <RefreshCw className="h-3.5 w-3.5" /> Check for Updates
                    </Button>
                  )}
                  {updateStatus === 'checking' && (
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled>
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
                      <Button type="button" size="sm" className="h-8 gap-1.5 text-xs w-fit" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5" /> Download &amp; Install
                      </Button>
                    </div>
                  )}
                  {updateStatus === 'downloading' && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Downloading update… {downloadPercent}%</p>
                      <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                      </div>
                    </div>
                  )}
                  {updateStatus === 'downloaded' && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">Update ready. The app will restart to install.</p>
                      <Button type="button" size="sm" className="h-8 gap-1.5 text-xs w-fit" onClick={handleInstall}>
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
                    <p className="text-xs text-muted-foreground italic">Updates are not available in development mode.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Legal</p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setLicenseOpen(true)}
                      className="text-xs text-left text-primary underline underline-offset-2 hover:opacity-80 w-fit"
                    >
                      Software License Agreement
                    </button>
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="text-xs text-left text-primary underline underline-offset-2 hover:opacity-80 w-fit"
                    >
                      Terms &amp; Conditions
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Contact</p>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleReachOut}>
                    <ExternalLink className="h-3.5 w-3.5" /> Reach Out
                  </Button>
                </div>
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
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
    aiPluginEnabled: false,
    aiClaudeBinaryPath: "",
    aiModel: 'default' as AiModel,
    defaultAorName: "",
    defaultAorCode: "",
    wpNumbering: DEFAULT_WP_NUMBERING,
    wpFiledBy: DEFAULT_WP_FILED_BY,
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
      };
    } catch (err) {
      console.error("Failed to parse settings:", err);
    }
  }

  return defaults;
}

// Initialize font size on app load
if (typeof window !== "undefined") {
  const settings = getSettings();
  applyUiFont(settings.uiFont);
  applyUiFontSize(settings.uiFontSize);
  applyInputFont(settings.inputFont);
  applyInputFontSize(settings.inputFontSize);
}

import React, { useState, useEffect, useRef } from "react";
import { Settings, FolderOpen, RefreshCw, ExternalLink, Moon, Sun, Download, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { getGenerationCounts, type UsageCounts } from "@/lib/firebase/usage-service";
import { LICENSE_TEXT, TERMS_TEXT } from "@/lib/legal";
import { cn } from "@/lib/utils";

type FontSize = 'small' | 'medium' | 'large';
type SlpTabView = 'splitter' | 'navigation';
type SettingsSection = 'view' | 'save' | 'durations' | 'support';

interface SettingsData {
  defaultDocxPath: string;
  defaultPdfPath: string;

  fontSize: FontSize;
  annexureLabelBackground: boolean;
  autosaveInterval: number;
  toastDuration: number;
  slpTabView: SlpTabView;
}

const SETTINGS_KEY = "drafto-settings";

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
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('view');
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
  const [settings, setSettings] = useState<SettingsData>({
    defaultDocxPath: "",
    defaultPdfPath: "",
    fontSize: 'small',
    annexureLabelBackground: false,
    autosaveInterval: 60,
    toastDuration: 1,
    slpTabView: 'splitter',
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
          fontSize: parsed.fontSize || 'small',
          annexureLabelBackground: parsed.annexureLabelBackground ?? false,
          autosaveInterval: parsed.autosaveInterval ?? 60,
          toastDuration: parsed.toastDuration ?? 1,
          slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
        });
        if (parsed.fontSize) applyFontSize(parsed.fontSize);
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
    applyFontSize(settings.fontSize);
    toast({ title: "Settings Saved", description: "Your settings have been updated." });
    setOpen(false);
  };

  const handleBrowse = async (type: "docx" | "pdf") => {
    if (window.electron?.selectDirectory) {
      try {
        const selectedPath = await window.electron.selectDirectory();
        if (selectedPath) {
          const keyMap: Record<typeof type, keyof SettingsData> = {
            docx: "defaultDocxPath",
            pdf: "defaultPdfPath",
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
            <SettingsNavRow label="View" selected={selectedSection === 'view'} onClick={() => setSelectedSection('view')} />
            <SettingsNavRow label="Save Locations" selected={selectedSection === 'save'} onClick={() => setSelectedSection('save')} />
            <SettingsNavRow label="Durations" selected={selectedSection === 'durations'} onClick={() => setSelectedSection('durations')} />
            <SettingsNavRow label="Support" selected={selectedSection === 'support'} onClick={() => setSelectedSection('support')} />
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── VIEW ── */}
            {selectedSection === 'view' && (
              <div className="space-y-4">
                {/* Usage counts */}
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/40 border">
                  <span className="text-xs text-muted-foreground dark:text-slate-300 shrink-0">Your Usage:</span>
                  <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.paperbooksGenerated}</span>
                  <span className="text-xs text-muted-foreground">Paperbooks (PDFs),</span>
                  <span className="text-xs tabular-nums font-semibold">{usageCounts === null ? "…" : usageCounts.docxGenerated}</span>
                  <span className="text-xs text-muted-foreground">Drafts (Docx)</span>
                </div>

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

                {/* Text Size */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Text Size</p>
                  <RadioGroup
                    value={settings.fontSize}
                    onValueChange={(value: FontSize) => setSettings((prev) => ({ ...prev, fontSize: value }))}
                    className="flex gap-3"
                  >
                    {(['small', 'medium', 'large'] as FontSize[]).map((s) => (
                      <div key={s} className="flex items-center gap-1">
                        <RadioGroupItem value={s} id={`size-${s}`} />
                        <Label htmlFor={`size-${s}`} className="text-xs font-normal cursor-pointer capitalize">{s}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Petition View */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Petition Tab Style</p>
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

                {/* Annexure Labels */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="annexure-bg"
                    checked={settings.annexureLabelBackground}
                    onChange={(e) => setSettings((prev) => ({ ...prev, annexureLabelBackground: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-gray-300 shrink-0"
                  />
                  <Label htmlFor="annexure-bg" className="text-xs font-normal cursor-pointer text-muted-foreground">
                    Add white background behind Annexure Labels
                  </Label>
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


              </div>
            )}

            {/* ── DURATIONS ── */}
            {selectedSection === 'durations' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground dark:text-slate-300 uppercase tracking-wide">Notifications</p>
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

            {/* ── SUPPORT ── */}
            {selectedSection === 'support' && (
              <div className="space-y-4">
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

// Helper function to apply font size to HTML element
function applyFontSize(fontSize: FontSize) {
  if (typeof document === "undefined") return;
  
  const html = document.documentElement;
  // Remove existing size classes
  html.classList.remove('text-size-small', 'text-size-medium', 'text-size-large');
  // Add new size class
  html.classList.add(`text-size-${fontSize}`);
}

// Helper function to get settings
export function getSettings(): SettingsData {
  if (typeof window === "undefined") {
    return {
      defaultDocxPath: "",
      defaultPdfPath: "",
      fontSize: 'small',
      annexureLabelBackground: false,
      autosaveInterval: 60,
      toastDuration: 1,
      slpTabView: 'splitter' as SlpTabView,
    };
  }

  const stored = localStorage.getItem(SETTINGS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        defaultDocxPath: parsed.defaultDocxPath || "",
        defaultPdfPath: parsed.defaultPdfPath || "",
        fontSize: parsed.fontSize || 'small',
        annexureLabelBackground: parsed.annexureLabelBackground ?? false,
        autosaveInterval: parsed.autosaveInterval ?? 60,
        toastDuration: parsed.toastDuration ?? 1,
        slpTabView: (parsed.slpTabView || 'splitter') as SlpTabView,
      };
    } catch (err) {
      console.error("Failed to parse settings:", err);
    }
  }

  return {
    defaultDocxPath: "",
    defaultPdfPath: "",
    fontSize: 'small',
    annexureLabelBackground: false,
    autosaveInterval: 60,
    toastDuration: 1,
    slpTabView: 'splitter' as SlpTabView,
  };
}

// Initialize font size on app load
if (typeof window !== "undefined") {
  const settings = getSettings();
  applyFontSize(settings.fontSize);
}

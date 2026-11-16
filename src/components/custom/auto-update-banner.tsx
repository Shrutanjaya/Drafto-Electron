import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type UpdateBannerState = "idle" | "checking" | "downloading" | "downloaded" | "error";

/**
 * Mandatory auto-update banner:
 * - Updates download quietly in the background while the app stays usable.
 * - Once downloaded, displays an insistent, non-dismissible "Update ready — restart now" bar.
 * - If offline or the check/download fails, displays a gentle dismissible banner so the user is never blocked.
 */
export function AutoUpdateBanner() {
  const [status, setStatus] = useState<UpdateBannerState>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!window.electron) return;

    window.electron.auGetState?.().then((state: { status?: string; version?: string | null; error?: string | null } | null) => {
      if (!state) return;
      if (state.version) setVersion(state.version);
      if (state.status === "downloaded") {
        setStatus("downloaded");
      } else if (state.status === "downloading" || state.status === "available") {
        setStatus("downloading");
      } else if (state.status === "error") {
        setStatus("error");
      }
    });

    window.electron.onAuUpdateAvailable?.((info: { version: string }) => {
      if (info?.version) setVersion(info.version);
      setStatus("downloading");
    });

    window.electron.onAuDownloadProgress?.(() => {
      setStatus("downloading");
    });

    window.electron.onAuUpdateDownloaded?.((info: any) => {
      if (info?.version) setVersion(info.version);
      setStatus("downloaded");
    });

    window.electron.onAuUpdateNotAvailable?.(() => {
      setStatus("idle");
    });

    window.electron.onAuError?.(() => {
      setStatus((prev) => (prev === "downloaded" ? "downloaded" : "error"));
    });
  }, []);

  const handleRestartNow = () => {
    if (installing) return;
    setInstalling(true);

    // Save active draft to disk before restarting
    const saveEvent = new CustomEvent("drafto-save-project", {
      detail: {
        callback: () => {
          setTimeout(() => {
            window.electron?.auInstall?.();
          }, 300);
        },
      },
    });
    window.dispatchEvent(saveEvent);

    // Fallback in case event is not caught
    setTimeout(() => {
      window.electron?.auInstall?.();
    }, 2000);
  };

  const handleRetry = async () => {
    if (!window.electron?.auCheck) return;
    setErrorDismissed(false);
    setStatus("checking");
    const res = await window.electron.auCheck();
    if (res?.status === "error") {
      setStatus("error");
    } else if (res?.status === "dev") {
      setStatus("idle");
    }
  };

  if (status === "downloaded") {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/40 bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" style={{ animationDuration: "4s" }} />
          <span>
            A new version of Drafto{version ? ` (v${version})` : ""} has been downloaded and is ready to install. Please restart now to apply the update.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 font-semibold shadow-sm"
          disabled={installing}
          onClick={handleRestartNow}
        >
          {installing ? "Saving & restarting…" : "Update ready — restart now"}
        </Button>
      </div>
    );
  }

  if (status === "error" && !errorDismissed) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Could not check for or download updates (you may be offline). You can continue working normally.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs hover:bg-amber-500/20"
            onClick={handleRetry}
          >
            Retry
          </Button>
          <button
            type="button"
            aria-label="Dismiss update notice"
            onClick={() => setErrorDismissed(true)}
            className="rounded p-0.5 hover:bg-amber-500/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

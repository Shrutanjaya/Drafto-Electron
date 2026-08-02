import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Split-view helper: a toolbar button that opens one editing section in a
 * dialog. Split view can only show a few panels side by side, so the remaining
 * sections (Facts, Prayers, Interim Relief, …) are reachable this way — the
 * same pattern the SLP tab uses for Questions of Law / Interim Relief / etc.
 */
export function SectionDialog({
  label,
  title,
  active,
  children,
  className,
}: {
  label: string;
  title?: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ro-nav
          className={className ?? "h-7 gap-1.5 text-xs"}
          title={title ?? label}
        >
          <span
            className={
              "h-1.5 w-1.5 shrink-0 rounded-full " +
              (active ? "bg-green-500" : "bg-muted-foreground/30")
            }
          />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{title ?? label}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

import * as React from "react"
import { Bell, Trash2, AlertCircle, CheckCircle2, Info, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSessionNotifications, type SessionNotification } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

function formatTime(date: Date) {
  try {
    return new Intl.DateTimeFormat("default", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date)
  } catch {
    return ""
  }
}

export function NotificationsPopover() {
  const [open, setOpen] = React.useState(false)
  const { notifications, clear, markAsRead, unreadCount } = useSessionNotifications()

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen && unreadCount > 0) {
      markAsRead()
    }
  }

  const renderIcon = (variant?: SessionNotification["variant"]) => {
    switch (variant) {
      case "destructive":
        return <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
      case "success":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
      default:
        return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 w-8 p-0"
          title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white leading-none shadow-xs">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-3.5 py-2.5 bg-muted/30">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-foreground/80" />
            <span className="text-xs font-semibold">Notifications</span>
            {notifications.length > 0 && (
              <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.2 rounded-full font-medium">
                {notifications.length}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive gap-1"
              title="Clear notification history"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-muted-foreground">
            <Bell className="h-7 w-7 opacity-25 mb-2" />
            <p className="text-xs font-medium">No notifications yet</p>
            <p className="text-[11px] opacity-70 mt-0.5">
              Toasts and alerts from this session will appear here.
            </p>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto overscroll-contain divide-y divide-border/40">
            {notifications.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-2.5 p-3 text-left transition-colors hover:bg-muted/40",
                  !item.read && "bg-primary/5"
                )}
              >
                {renderIcon(item.variant)}
                <div className="flex-1 min-w-0">
                  {item.title && (
                    <div className="text-xs font-medium text-foreground leading-snug break-words">
                      {item.title}
                    </div>
                  )}
                  {item.description && (
                    <div className="text-[11px] text-muted-foreground leading-normal mt-0.5 break-words">
                      {item.description}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-1">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatTime(item.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

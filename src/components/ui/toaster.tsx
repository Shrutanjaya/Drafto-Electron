"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { getSettings } from "@/components/dialogs/settings-dialog"

export function Toaster() {
  const { toasts } = useToast()
  const { toastDuration } = getSettings()

  return (
    <ToastProvider duration={toastDuration * 1000}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1 w-full text-center">
              {title && <ToastTitle className={(props as any).variant === 'success' ? 'font-normal' : ''}>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

"use client"

// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  skipSessionLog?: boolean
}

export interface SessionNotification {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive" | "success"
  timestamp: Date
  read: boolean
}

let sessionHistory: SessionNotification[] = []
const historyListeners: Array<(history: SessionNotification[]) => void> = []

function notifyHistoryListeners() {
  historyListeners.forEach((listener) => listener([...sessionHistory]))
}

export function clearSessionNotifications() {
  sessionHistory = []
  notifyHistoryListeners()
}

export function markNotificationsAsRead() {
  sessionHistory = sessionHistory.map((n) => ({ ...n, read: true }))
  notifyHistoryListeners()
}

export function useSessionNotifications() {
  const [history, setHistory] = React.useState<SessionNotification[]>(sessionHistory)

  React.useEffect(() => {
    historyListeners.push(setHistory)
    return () => {
      const idx = historyListeners.indexOf(setHistory)
      if (idx > -1) historyListeners.splice(idx, 1)
    }
  }, [])

  return {
    notifications: history,
    clear: clearSessionNotifications,
    markAsRead: markNotificationsAsRead,
    unreadCount: history.filter((n) => !n.read).length,
  }
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (updatedProps: ToasterToast) => {
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...updatedProps, id },
    })
    sessionHistory = sessionHistory.map((item) =>
      item.id === id
        ? {
            ...item,
            title: updatedProps.title !== undefined ? updatedProps.title : item.title,
            description: updatedProps.description !== undefined ? updatedProps.description : item.description,
            variant: (updatedProps.variant as any) || item.variant,
          }
        : item
    )
    notifyHistoryListeners()
  }

  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  // Log to session notifications history (keep up to 100 most recent items of the session).
  // Exclude routine autosave / "Saved" popups from cluttering the notification drawer.
  const isAutosaveOrSave =
    Boolean((props as any)?.skipSessionLog) ||
    (typeof props.title === "string" &&
      (props.title.trim().toLowerCase() === "saved" ||
        props.title.toLowerCase().includes("autosave")));

  if (!isAutosaveOrSave) {
    sessionHistory = [
      {
        id,
        title: props.title,
        description: props.description,
        variant: (props.variant as any) || "default",
        timestamp: new Date(),
        read: false,
      },
      ...sessionHistory,
    ].slice(0, 100)
    notifyHistoryListeners()
  }

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }

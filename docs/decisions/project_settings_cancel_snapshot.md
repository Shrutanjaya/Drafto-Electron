---
name: settings-cancel-snapshot
description: Settings dialog Cancel reverts via an open-time snapshot — new settings MUST be Save-gated or they re-break Cancel
metadata: 
  node_type: memory
  type: project
  originSessionId: f50d2fed-525f-4b38-911c-0c97e28b52a4
  modified: 2026-07-21T09:07:52.570Z
---

The shared Settings dialog (`src/components/dialogs/settings-dialog.tsx`, used by BOTH SLP and WP) now discards unsaved edits on Cancel/Escape/outside-click. Mechanism: `handleOpenChange` snapshots `{ settings, theme }` into `openSnapshotRef` when the dialog opens; on any close that isn't Save it calls `revertUnsaved()` (restores `settings`, `theme`, and re-applies live `applyUiFont/applyInputFont`). The Cancel button and `<Dialog onOpenChange>` both route through `handleOpenChange(false)`; `handleSave` uses the raw `setOpen(false)` so it bypasses the revert.

**Gotcha (why it was broken before):** two settings persisted IMMEDIATELY on change, bypassing Save — `exportHighlight` wrote `drafto-settings` on toggle, and the theme toggle still writes `localStorage('theme')` live. Any NEW setting that writes to localStorage on change (instead of only in `handleSave`) will re-break Cancel. Rule: **Save-gate every setting** (mutate the `settings` state only; let `handleSave` persist). The theme live-write is tolerated because `revertUnsaved` calls `setTheme(snapshot)` which re-runs the theme effect and rewrites `localStorage('theme')` back.

**Why:** user reported Settings changes were kept even after pressing Cancel, in both tools. **How to apply:** when adding settings, never `localStorage.setItem` in an onChange; if a value must be readable pre-Save (e.g. by an exporter reading localStorage), the user must Save first — that is now the consistent contract.

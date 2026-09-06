---
name: project_settings_multidoctype
description: "Settings restructured for multiple court/doctypes — Option 1 flat keys, per-doctype nav with court tags, one-time SLP→other seed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0bb63d65-57a2-41fd-964d-df3927f070c9
  modified: 2026-08-03T19:12:57.071Z
---

Drafto's Settings dialog ([src/components/dialogs/settings-dialog.tsx](src/components/dialogs/settings-dialog.tsx)) is being generalised from SLP-only to multiple court/document types. Decisions (2026-08, uncommitted working tree):

**Storage model = Option 1 (flat keys), NOT nested.** Chosen because settings live only in each user's localStorage (`drafto-settings`) — a nested refactor would need flawless per-machine migration or users lose settings. So: keep existing flat prefixed keys (`outputFont`/`wpOutputFont`, `slpMargin*`/`wpMargin*`, `aorSignature*`/`wpSignature*`, SC vs `wp*` annexure/pagination/truecopy); add new prefixed keys per future doctype; court-shared families get one key-set per court. UI can look clean regardless.

**One-time SLP→other seed** (`seedSettingsFromSlpOnce()` in settings-dialog, runs at module load, guarded by localStorage flag `drafto-settings-seeded-from-slp-v1`). Commercial users only ever tuned SLP, so on first launch after update it copies SLP values into the corresponding WP keys via table `SLP_TO_WP_SEED` — but only overwrites a target key STILL AT ITS DEFAULT (preserves deliberate WP tweaks). Includes formatting, margins, signature, annexure, pagination, true-copy. Extend the table for new doctypes.

**Nav (SettingsSection type):** common = `interface` (merged Appearance+Workspace, holds the export-highlights checkbox now), `customize` (Mayur AI), `save`, `shortcuts`, `support`; per-doctype = `slp` (tag SC), `wp` (tag HC). Court tags via `CourtTag`/`COURT_TAG_CLASS` (SC indigo, HC teal, CAT amber) on `SettingsNavRow`. Content blocks were RE-KEYED (not moved en masse): appearance+workspace→`interface`; formatting+AoR(userdefaults)+paperbook→`slp`; writpetition→`wp`. SLP page order: formatting → AoR details → paperbook.

**Placement rules (user-decided):** AoR/Advocate labelled "Advocate-on-Record (AoR)" for SC; Volume-splitting + Advocate Checklist are SC-ONLY (stay in the `slp` paperbook block, never shown for HC/CAT); SLP filed-by kept as-is (deliberately different from HC — auto-built from AoR name/code + signature, no editable table like WP's `wpFiledBy`).

**Compact layout grammar (2026-08-04, user-requested).** The `interface`, `slp`, `wp` and `oa` pages were rewritten to ONE grammar and all explanatory prose deleted: `SettingsGroup` (heading + optional (i) tooltip carrying the old prose) wrapping `SettingRow` (fixed 164px label column, controls right) / `CheckRow` / `SegGroup` (the `[This] [That]` segmented pairs) / `Unit`. Shared in-component builders: `numField(key, {min,max,step,int,width})`, `marginInputs`, `signatureSlot`, `filedByDesigner`, `filedByPreview`, `filedByFields`. **Rule: new settings on those four pages must use these primitives, and any explanation goes in the `info` tooltip, never as a `<p>` under the control.** `customize` (Mayur) and `support` were converted next; only `save` and `shortcuts` still use the old style. Legal/consent text stays visible on-page in an amber `NoticeBox` (`SignatureLiabilityNote`, `MayurTermsNote`) — never moved into a tooltip. Support gained an About row (app version via `__APP_VERSION__`, a Vite `define` from package.json declared in `src/vite-env.d.ts`) and a Subscription block reading `useEntitlement()` — plan label + status chip off `entitlement.reason` + covered fora, with an honest "Not enforced in this build" when `ENTITLEMENT_ENABLED` is false (otherwise it would show the optimistic fake 'active').

**Not yet done:** per-court sharing when a 2nd SC doctype (Transfer/Appeal) is added (they must read the same SC annexure/pagination/truecopy keys); no SLP sub-para-numbering setting added (would be a new feature, WP has `wpNumbering`); other doctypes (Transfer/Appeal/OA) not built. Validate with `npx vite build` (tsc broken — see repo notes). Related: [[project_writ_petition_dhc]].

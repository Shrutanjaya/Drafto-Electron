---
name: feedback_validation_typecheck
description: "`npx vite build` alone is NOT sufficient validation — it never type-checks; use tsc -p tsconfig.app.json filtered for TS2304"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0bb63d65-57a2-41fd-964d-df3927f070c9
  modified: 2026-08-02T18:08:39.179Z
---

`npx vite build` (the documented Drafto validation step) does **not** type-check — esbuild strips types. A bare undefined identifier is valid JS syntax, so **a missing import builds green and then crashes at runtime**. This actually shipped: `ENTITLEMENT_ENABLED` was used in `src/providers/entitlement-provider.tsx` without its import, vite built fine, and the app died with "ENTITLEMENT_ENABLED is not defined" when DraftoClient mounted (it even reached a CI beta build).

**Root cause of the mistake:** doing a scripted (python) `s.replace()` for the import line without asserting the replacement happened. The file used single quotes; the pattern used double quotes, so the import was silently never added while the *usage* edit (which had an assert) succeeded.

**Rules:**
1. After ANY scripted string replacement, `assert old in s` for EVERY replacement — never let one fail silently.
2. `vite build` proves bundling, not correctness. Also run:
   `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS2304"`
   → must be 0. TS2304 = "Cannot find name" = undefined identifier / missing import.
3. **`npx tsc --noEmit -p tsconfig.json` is a NO-OP** — the root tsconfig.json is a solution-style file (`"files": []` + references to tsconfig.app.json / tsconfig.node.json), so it checks nothing and always reports 0 errors. Always target `tsconfig.app.json`.
4. `tsconfig.app.json` has NO path aliases, so it emits ~467 "Cannot find module '@/…'" errors — that noise is expected and is why CLAUDE.md says typecheck is "broken". Filter to TS2304 (and other real codes) instead of dismissing tsc entirely; module-resolution noise does NOT mask TS2304 for a missing import, because with no import statement the identifier is simply undeclared.

**Why:** a green build gave false confidence and a broken beta went to CI.
**How to apply:** run the TS2304 filter before declaring any change done, and especially before tagging a release. See [[project_release_process]].

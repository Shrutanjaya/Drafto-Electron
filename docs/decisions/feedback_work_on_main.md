---
name: feedback_work_on_main
description: "Work on `main` in the Drafto repo, not `develop` — stated 2026-08-17"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d2ad3909-6b10-4f3f-864a-5b6acfaff06d
  modified: 2026-08-17T05:53:21.579Z
---

From 2026-08-17 (v2.0.4 onwards), work directly on **`main`** in ~/DraftoSLP.
Do not branch off or commit to `develop`.

**Why:** the two branches were kept in sync by hand, every commit going to both,
and it caused repeated confusion about which one a change was actually on.
`develop` is now behind whatever `main` carries.

**How to apply:** commit to `main`, push `main`, tag from `main`. Any older note
saying "develop and main are both at vX and kept in sync" (including the repo
briefing text) is out of date — offer to correct it if it resurfaces. Releases
still work the same way: see [[project_release_process]] — tagging builds a
DRAFT; publishing is the user's click.

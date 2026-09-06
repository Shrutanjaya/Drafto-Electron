---
name: project_slp_appendix_multi
description: "SLP Appendix takes several documents (provisions/judgment/custom) — one Index row + merge component each; stamps must anchor on the CropBox, not the media box"
metadata: 
  node_type: memory
  type: project
  originSessionId: d2ad3909-6b10-4f3f-864a-5b6acfaff06d
  modified: 2026-08-17T05:30:53.384Z
---

Built 2026-08-17 (uncommitted on `develop` at the time): the Supreme Court Appendix
now takes **several documents**, each of which may be statutory provisions, a
judgment, or anything else, uploaded or typed out.

- `src/lib/appendix.ts` is the single source for the Appendix everywhere (dialog,
  Index, bookmarks, merge, DOCX). The old single-Appendix fields are folded in on
  read, so old projects still open; nothing writes them again.
- **The invariant that matters:** the Index rows, the merge components and the
  page ranges must all come from `getActiveAppendixItems()`. When they drifted
  before, a missing Index row shifted every page number after it.
- Labels: "Appendix" alone when one document is attached, "Appendix-A/-B…" when
  several — counted over the documents that actually have something attached.
- Each uploaded Appendix gets its label stamped on its first page (like an
  annexure) but **no True Copy mark** — an Appendix is not a copy of a record.

Two general lessons from the same session:

1. **Stamping anchors on the visible frame.** Page numbers, annexure labels and
   the True Copy mark are placed from the CropBox clipped to the MediaBox, not
   from `page.getSize()` (which is the media box and ignores its origin). A
   cropped upload — common for statute extracts and downloaded judgments — put
   the stamp outside the visible area, so the page came back apparently
   unnumbered. See `visibleFrame()` in `src/lib/actions.ts`.
2. **Numbered paragraphs restart after a table.** The IA body is numbered in
   segments: each table closes the segment and the paragraphs after it open a
   fresh numbering reference that states its own start. The SLP does the same
   with hard-coded starts (`slp-intro-list-3/6/7/8`). Setting
   `paragraph.properties.numbering` after construction is a **no-op** — docx
   builds the XML in the constructor.

See [[project_release_process]] before tagging.

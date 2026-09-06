# Drafto — session handover

Written 2026-09-06. Start the new session with: **"Read HANDOVER.md and pick up from there."**

---

## Where things stand right now

- Working copy `~/DraftoSLP`, branch **`main`** (`develop` is retired — everything goes to `main`).
- `package.json` is at **2.0.9**. Working tree clean apart from this file.
- **`v2.0.9` shipped.** Tagged at `a325cd9`; CI run `34020115213` finished with both jobs green; the release is published with all eight assets (Mac zip + DMG, Windows exe, blockmaps, `latest-mac.yml`, `latest.yml`). Nothing is pending on the release front.
  - Rule for the next release: **never publish before both jobs are green.** electron-builder only uploads into a *draft*; if the release is already published when the Mac job finishes it skips every Mac file and still exits 0. Recovering means re-drafting and re-running the Mac job (~45 min). This happened on v2.0.5.

### Commits in this session

`70a0a77` writ IO mark · `04b846e` Facts fidelity + WP dialog + vakalatnama · `24b41eb` annexure details in dialogs · `a325cd9` CI LibreOffice fetch. Plus `build:` commits for 2.0.8 and 2.0.9.

---

## Non-negotiable working rules

- **Validation after every change** (`npx vite build` does NOT type-check):
  ```bash
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v TS2307 | grep -c error   # baseline 35, currently 32
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE "TS2304|TS2686"         # must be 0
  npx vite build
  ```
  TS2307 is noise (the `@/` alias isn't configured for tsc). TS2304/TS2686 crash at runtime while the build passes.
- **Assert every scripted replace.** Edits are done with `python3` heredocs; always `assert s.count(old)==1` — a pattern that matches a *prefix* of a longer line silently corrupts the file (it happened twice: a stranded trailing comment in `schema.ts`, and an import inserted inside a multi-line import in `basic-tab.tsx`).
- **Testing and app launch** — Launching the app, inspecting the UI, taking screenshots, and verifying docx/pdf output end-to-end is permitted (authorized by user 2026-09-06).
- **Commit/push/tag only when asked.** Tell them before tagging when a release changes customer-visible behaviour.
- Commit style: a `feat:`/`fix:`/`ci:` commit for the work, then a separate `build: vX.Y.Z` commit for the version bump. Bodies explain *why*, in plain English. End with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- The user is a lawyer, not a coder: plain English, lead with the answer, no bare identifiers as shared vocabulary, flag decisions that are theirs with a recommendation.

### How to verify document work without the app

The pattern used throughout this session, and it repeatedly caught real bugs:

```bash
S=$(ls -d /private/tmp/claude-501/-Users-arunbhardwaj-DraftoSLP/*/scratchpad | tail -1); cd $S
npx esbuild /Users/arunbhardwaj/DraftoSLP/src/lib/<module>.ts --bundle --format=esm \
  --outfile=x.mjs --log-level=error --alias:@=/Users/arunbhardwaj/DraftoSLP/src
node …            # then unzip -p out.docx word/document.xml and grep the XML
```

- To check **layout** (page breaks, table widths), convert with the bundled LibreOffice:
  `/Users/arunbhardwaj/DraftoSLP/build/libreoffice-staging/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir . x.docx`
  then read it with `pdfjs-dist/legacy/build/pdf.js` (per-page text, and `transform[4]`/`width` give x-positions in points — that's how the table-overflow bug was measured).
- To check **browser layout**, run real Chromium via the Electron binary at `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` with a tiny `main.js` + `package.json` in the scratchpad. (The preview pane renders local files as static snapshots with scripts disabled, so it can't measure anything.)
- Bundling anything that reaches `oa-actions.ts` pulls in Firebase/grpc and **won't run in Node** — the CAT generators can't be exercised this way.

---

## Work completed in this session (2026-09-06)

1. **Annexure reordering** (all three tools) — drag-and-drop reordering inside annexure dialogs, updating derived P/A numbers live.
2. **Project naming & rename system** — file name on disk reflects project name, inline rename in header, fixed `Cmd+S` keyboard shortcut bug.
3. **Word export table overhang** — table width set to `100%` (`WidthType.PERCENTAGE`), fitting page margins in Grounds, Synopsis, and List of Dates.
4. **On-screen editor tables** — 100% fluid proportional tables across Nav and Split views with smooth border dragging and zero first-load hover jumps.
5. **Institutional memory & decisions** — 16 decision files imported into `docs/decisions/` in the repo.

## Outstanding work, in the user's own words

1. **Mandatory auto-update.** Their decisions, already taken: **download quietly in the background** (app stays usable), then an **insistent, non-dismissible "Update ready — restart now"** bar; if the download fails or there's no internet, **let them in with a dismissible banner**. The app already uses `electron-updater` (`autoDownload=false`, `autoInstallOnAppQuit=false` in `electron/main.js`).
2. **Extra fonts** (Equity Text A, Palatino Linotype, Tinos) — analysis done, nothing built. Tinos is Apache-licensed and can be bundled (including into the bundled LibreOffice's own font folder, so PDFs get it with nothing installed); Palatino Linotype and Equity Text A cannot be redistributed — offer them as "use if installed", and TeX Gyre Pagella as a bundleable Palatino. Page numbers and stamps are drawn by pdf-lib, which only has the 14 standard PDF fonts, so matching them to the body font needs font embedding (fontkit).
3. **Petitioner(s)/has-have** — smart singular/plural in the hard-coded text of all three tools, driven by the number of parties, updating live. Not started.
4. **Cover page overflow (SLP)** — with a long cause title *and* several applications, the cover page content outgrows one page and pushes "PAPERBOOK" and the AoR line onto a second. Pre-existing; user was told; not fixed.
5. **CAT Facts** need a real end-to-end check (see below).

---

## The table work — solved (2026-09-06)

The table issues in both Word export and the on-screen editor have been resolved:

1. **Word export table overhang**:
   - Fixed in `src/lib/html-to-docx.ts` by setting exported table width to `100%` (`WidthType.PERCENTAGE`). Tables now cleanly fit within page margins in all contexts (Grounds, Synopsis, List of Dates) without overhanging the right margin.

2. **On-screen editor table reflow & column resizing**:
   - Fixed via `src/components/custom/table-proportional.ts` and `src/components/custom/badhiya-box.tsx`:
     - Tables are rendered with `width: 100%; table-layout: fixed;` and columns with percentage widths (`<col style="width: XX.XXXX%">`).
     - A custom proportional column resizing plugin (`createProportionalResizingPlugin`) handles dragging. Dragging redistributes width between the adjacent columns (`col` and `col + 1`) only, keeping the table width locked at 100% without expanding the table or collapsing undragged columns.
     - Cell widths are stored as normalized 10,000-basis-point integers in the document.
     - `hydrateTableColWidths` ensures that opening an existing saved project parses the saved proportions immediately on mount with zero hover delay.
     - In `globals.css`, table wrappers are constrained with `overflow-x: hidden; width: 100%;` and cells use `word-break: break-word` to ensure long text never forces a column to overflow.


---

## Traps discovered this session (each cost a round trip)

- **Page breaks in the SLP front matter**: a break must live in a paragraph, and that paragraph needs room — on a full cover page it slides onto page 2 and fires there, leaving a blank page. Putting `pageBreakBefore` on the next heading is worse: LibreOffice then carries the framed "Advocate for the Petitioner(s)" line onto the following page. **Use section breaks** (the CI now has three sections). 
- **`attr()` in CSS** reads from the element the pseudo-element is on, not an ancestor; and an element has only one `::after`. The quote's closing-mark cue already owned it, which is why the emphasis label only appeared when the user typed their own closing quote. It's now a ProseMirror widget in the `quoteCue` plugin.
- **Native save dialogs are exclusive**: asking for a second while one is open drops it silently. Batches now ask once for a folder; `electron/main.js` also queues save dialogs.
- **Word/LibreOffice restart a numbered list after a table.** The IA body is numbered in segments, each stating its own start; the SLP does the same with hard-coded starts. Setting `paragraph.properties.numbering` after construction is a **no-op** — docx builds the XML in the constructor.
- **Stamping on uploaded PDFs** must be anchored to the CropBox∩MediaBox (`visibleFrame()` in `actions.ts`), not `page.getSize()`, or the stamp lands outside the visible area on cropped scans.
- **The LibreOffice mirror deletes point releases.** The workflow now resolves the newest version from the mirror itself and downloads it (`LIBREOFFICE_VERSION` pins one). This is the **first build on LibreOffice 26.8** rather than 26.2 — worth eyeballing a generated PDF.

---

## Things to test in the app (nothing below is app-verified)

- CAT paper-book — its Facts numbering rewrite (`applyOaListCascade` in `oa-actions.ts`) is verified only by type-check and reading; the generator can't be run outside Electron.
- Writ dialog with an annexure whose file isn't on the machine → should read "Attached on another computer (…) — not on this machine" in red.
- Writ dialog with an active CM → its own affidavit upload slot; uploading one should *replace* the generated affidavit, not add to it.
- Refiling declaration (SLP) and a criminal SLP with Proof of Service — both touch the Index, where a mistake shifts page numbers.
- Multi-document buttons with **no** default docx folder set → one folder prompt, then every file written there.

---

## Map of what was touched

`src/lib/`: `grounds-headings.ts`, `list-regimes.ts`, `quote-emphasis.ts`, `appendix.ts`, `annexure-details.ts`, `file-availability.ts`, `deponent-from-party.ts`, `vakalatnama.ts` (all new this session or last); `actions.ts` (SLP generators + PDF assembly), `html-to-docx.ts` (shared exporter), `wp/*`, `oa/*`.
`src/components/`: `dialogs/{pdf,wp-pdf,oa-pdf}-generation-dialog.tsx`, `dialogs/appendix-dialog.tsx`, `custom/badhiya-box.tsx`, `custom/editor-toolbar.tsx`, `custom/aam-table.tsx`, `wp/wp-workspace.tsx`, `header.tsx`.
`electron/main.js` + `preload.js`: `reveal-file-path`, `pick-save-folder`, `path-exists`, and the save-dialog queue.

Memory files worth reading at `~/.claude/projects/-Users-arunbhardwaj-DraftoSLP/memory/` — particularly `project_release_process.md` (corrected: tagging does **not** publish; the draft waits for a human) and `feedback_work_on_main.md`.

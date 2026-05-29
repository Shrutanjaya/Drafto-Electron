# Word 365 PDF Conversion via AppleScript — Bug Report

**App:** DraftoSLP (Electron 28 + React 18 + Vite 6)  
**Platform:** macOS Tahoe 26.5, Apple Silicon (arm64)  
**Word version:** Microsoft Word 365 (latest as of May 2026)  
**Xcode CLT:** NOT installed (no `sdef`, no `xcodebuild`)  
**LibreOffice:** NOT installed  
**Node.js:** 20.19.4  

---

## The Problem

The app converts DOCX files to PDF using Microsoft Word's AppleScript automation. This worked in older versions of Word but is now broken on Word 365 on modern macOS. Every AppleScript approach tried produces a **compile-time parse error (-2741)** — meaning `osascript` rejects the script before it even runs.

The relevant code lives in `electron/ipc/pdf-converter.js`, inside the `convertWithDocx2Pdf()` function's `darwin` branch.

The flow is:
1. App generates a `.docx` file to a temp path (e.g. `/var/folders/.../T/advocateChecklist.docx`)
2. `convertWithDocx2Pdf(docxPath, pdfPath, ...)` is called
3. LibreOffice is absent, so the Microsoft Word branch is entered
4. An `.applescript` file is written to `os.tmpdir()`
5. `osascript "/path/to/script.applescript"` is executed
6. Error is thrown

---

## Attempts Made

### Attempt 1 — `save as` with `file format format PDF`

**Script:**
```applescript
tell application "Microsoft Word"
  open POSIX file "/tmp/input.docx"
  delay 3
  set theDoc to active document
  save as theDoc file name "/tmp/output.pdf" file format format PDF
  close theDoc saving no
end tell
```

**Error:**  
`execution error: Microsoft Word got an error: Can't handle this command. (-1708)`

**Analysis:**  
`-1708` means the application (or object) received a message it does not handle. In older Word for Mac, `save as` was a document-level command that accepted `file format format PDF`. In Word 365, this command appears to have been removed or renamed at the AppleScript dictionary level. The application receives the `save as` event and rejects it.

---

### Attempt 2 — `export as fixed format` with inline string path

**Script:**
```applescript
tell application "Microsoft Word"
  open POSIX file "/tmp/input.docx"
  delay 3
  set theDoc to active document
  export as fixed format theDoc output file name "/tmp/output.pdf"
  close theDoc saving no
end tell
```

**Error:**
```
script.applescript:565:571: script error: Expected end of line, etc. but found property. (-2741)
```

**Analysis:**  
`-2741` is a **compile-time** syntax error — the script is rejected before execution. The error "found property" at the position of `output file name` indicates the AppleScript compiler is interpreting the compound label `file name` as a property expression (i.e., it sees `file` as a type name and `name` as a property accessor). Without Xcode CLT installed, `osascript` cannot query Word's scripting dictionary at compile time, so it cannot recognise `output file name` as a valid parameter label for `export as fixed format`. The script fails to compile.

---

### Attempt 3 — `export as fixed format` with HFS path variable

**Script:**
```applescript
tell application "Microsoft Word"
  open POSIX file "/tmp/input.docx"
  delay 3
  set theDoc to active document
  set pdfHFSPath to (POSIX file "/tmp/output.pdf") as string
  export as fixed format theDoc output file name pdfHFSPath
  close theDoc saving no
end tell
```

**Error:**
```
script.applescript:565:571: script error: Expected end of line, etc. but found property. (-2741)
```

**Analysis:**  
Same error as Attempt 2 at the same position. Converting the PDF path to an HFS path (colon-delimited, e.g. `Macintosh HD:private:var:...`) was intended to fix the earlier "Can't make file" error seen with the raw POSIX string, but the compile-time `-2741` still fires on `output file name` regardless of what the argument is. The parser fails before it ever evaluates the value.

---

### Attempt 4 — `do Visual Basic` to bypass AppleScript parameter parsing

**Motivation:**  
Since `export as fixed format` has an unparseable compound parameter name, the idea was to sidestep AppleScript's parameter system entirely by calling VBA directly via Word's `do Visual Basic` command. VBA's `ExportAsFixedFormat` is the canonical Word PDF export API and accepts POSIX paths on macOS.

**Script:**
```applescript
tell application "Microsoft Word"
  set wordAlreadyHadDocs to (count of documents) > 0
  if not wordAlreadyHadDocs then set visible to false
  open POSIX file "/tmp/input.docx"
  delay 5
  set theDoc to active document
  if wordAlreadyHadDocs then
    try
      set window state of window 1 of theDoc to wdWindowStateMinimize
    end try
  end if
  do Visual Basic "ActiveDocument.ExportAsFixedFormat OutputFileName:=\"/tmp/output.pdf\", ExportFormat:=wdExportFormatPDF, OpenAfterExport:=False"
  close theDoc saving no
end tell
```

**Error:**
```
script.applescript:422:428: script error: Expected end of line, etc. but found identifier. (-2741)
```

**Analysis:**  
Again a **compile-time** `-2741`. The error position (422:428) falls squarely on the `do Visual Basic` line — specifically the word `Visual`. In AppleScript's Standard Additions, `do` is the start of `do shell script`. When the compiler sees `do Visual`, `Visual` is an unexpected identifier because `do Visual Basic` is not a Standard Addition command — it is a Word-specific scripting dictionary command. The compile-time error occurs because `osascript` either cannot find `do Visual Basic` in Word's dictionary at parse time (again, likely related to no Xcode CLT), or Word 365 has removed this command from its dictionary entirely.

---

## Root Cause Summary

There are **two interacting problems**:

1. **Xcode CLT is missing.** `sdef` (Scripting Definition extractor) requires Xcode Command Line Tools and is completely unavailable. This means we cannot inspect Word's actual AppleScript dictionary to learn the exact command names, parameter labels, and enumeration values it exports. We have been guessing at the syntax based on documentation that may be outdated for Word 365.

2. **Word 365 on modern macOS has changed its AppleScript dictionary.** Classic commands like `save as ... file format format PDF` return `-1708` (not handled). Commands like `export as fixed format` and `do Visual Basic`, which appear in older Word for Mac documentation, appear to no longer be valid or have changed their parameter structure. The compile-time `-2741` errors strongly suggest either that these commands are not in the dictionary, or their parameter labels have been renamed.

---

## What Has NOT Been Tried

### A. JXA (JavaScript for Automation)

Instead of AppleScript, use `osascript -l JavaScript` with a `.js` file. JXA has a different parser and resolves Word's API via a different bridging mechanism. Word 365 may still expose its document methods this way even if the AppleScript dictionary is broken.

**Proposed script (`word_conv.js`):**
```javascript
var word = Application("Microsoft Word");
word.open(Path("/tmp/input.docx"));
delay(3);
var doc = word.activeDocument;
// fileFormat 17 = wdFormatPDF in Word's object model
doc.saveAs({ fileName: "/tmp/output.pdf", fileFormat: 17 });
doc.close({ saving: 0 }); // 0 = wdDoNotSaveChanges
```

**Run with:** `osascript -l JavaScript /path/to/word_conv.js`

This is the highest-priority untried option.

### B. `print` AppleScript command + macOS PDF printer

AppleScript's `print` command can target macOS's built-in PDF virtual printer. This is indirect and fragile (depends on printer dialog state) but is a fallback.

### C. Python `docx2pdf` library

If `python3` is available, `pip3 install docx2pdf` then:
```bash
python3 -c "from docx2pdf import convert; convert('/tmp/input.docx', '/tmp/output.pdf')"
```
`docx2pdf` on macOS internally uses Word's AppleScript, but its exact dictionary interactions may differ from our manual attempts.

### D. Install LibreOffice

The simplest long-term fix for users who don't have Word, or as a fallback when Word's automation is broken. The LibreOffice `soffice --headless --convert-to pdf` path in the code already works correctly.

### E. Install Xcode CLT and inspect Word's dictionary

```bash
xcode-select --install
sdef "/Applications/Microsoft Word.app" | grep -A 20 "export\|save as\|fixed format"
```

This is the definitive diagnostic. Once the dictionary is inspected, the exact command syntax will be known.

---

## Current State of `electron/ipc/pdf-converter.js` (macOS Word branch)

```javascript
if (fs.existsSync("/Applications/Microsoft Word.app")) {
  const scriptPath = path.join(os.tmpdir(), `word_conv_${Date.now()}.applescript`);
  const safeDocx = docxPath.replace(/"/g, '\\"');
  const safePdf  = pdfPath.replace(/"/g, '\\"');
  const scriptContent = [
    'tell application "Microsoft Word"',
    "  set wordAlreadyHadDocs to (count of documents) > 0",
    "  if not wordAlreadyHadDocs then set visible to false",
    `  open POSIX file "${safeDocx}"`,
    "  delay 5",
    "  set theDoc to active document",
    "  if wordAlreadyHadDocs then",
    "    try",
    "      set window state of window 1 of theDoc to wdWindowStateMinimize",
    "    end try",
    "  end if",
    `  do Visual Basic "ActiveDocument.ExportAsFixedFormat OutputFileName:=\\"${safePdf}\\", ExportFormat:=wdExportFormatPDF, OpenAfterExport:=False"`,
    "  close theDoc saving no",
    "end tell",
  ].join("\n");
  fs.writeFileSync(scriptPath, scriptContent, "utf-8");
  try {
    await execAsync(`osascript "${scriptPath}"`, { timeout: 120000 });
  } catch (e) {
    throw new Error(`Microsoft Word PDF conversion failed: ${e.message}`);
  } finally {
    try { fs.unlinkSync(scriptPath); } catch {}
  }
  if (!fs.existsSync(pdfPath)) {
    throw new Error("Microsoft Word did not produce the output PDF file");
  }
  return;
}
```

---

## Recommended Next Steps (in priority order)

1. **Try JXA** — run `osascript -l JavaScript` with the script in section A above. This is the fastest test and requires no installs.

2. **Install Xcode CLT and run `sdef`** — `xcode-select --install` takes ~5 minutes. After that, `sdef "/Applications/Microsoft Word.app"` gives the ground truth on what commands Word actually exports. This ends the guessing.

3. **Switch the Word branch to JXA** if Attempt A works — write a `.js` temp file and call `osascript -l JavaScript` instead of `osascript`.

4. **Bundle LibreOffice** or ship it as a user-installed dependency as a fallback for macOS users who don't have Word, or for cases where Word's automation is broken.

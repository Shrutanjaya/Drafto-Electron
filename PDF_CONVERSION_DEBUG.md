# macOS PDF Conversion Debugging Notes

## Context
- App: DraftoSLP (Electron 28 + React)
- macOS: Tahoe 26.5
- User has: Microsoft Word (365, exact version unknown), NO LibreOffice
- Conversion path: DOCX file on disk → PDF file on disk, invoked via `osascript` from Node.js `execAsync`
- Code location: `electron/ipc/pdf-converter.js`, inside `if (process.platform === "darwin")` → Microsoft Word branch

---

## Attempts & Results

### Attempt 1 — `save as` at application level (ORIGINAL code)
```applescript
tell application "Microsoft Word"
  open POSIX file "${safeDocx}"
  set theDoc to active document
  try
    set window state of window 1 of theDoc to wdWindowStateMinimize
  end try
  save as theDoc file name "${safePdf}" file format format PDF
  close theDoc saving no
end tell
```
**Error**: `-1708` "Microsoft Word got an error: active document doesn't understand the 'save as' message."  
**Analysis**: Word receives `save as theDoc ...` at the application level, then re-dispatches it to `theDoc` (the document object). In modern Word 365 for Mac, the document object doesn't handle `save as` — it's supposed to stay at the application level. But Word is routing it down. This is a Word 365 behaviour change from earlier Word versions.

---

### Attempt 2 — Capture return value of `open`
```applescript
set theDoc to open POSIX file "${safeDocx}"
```
**Error**: `-2753` "The variable theDoc is not defined."  
**Analysis**: Word's `open` command does NOT return a document reference. The assignment fails silently, leaving `theDoc` undefined. `open` is a void command in Word's AppleScript dictionary.

---

### Attempt 3 — `tell theDoc` block wrapping `save as`
```applescript
tell theDoc
  save as file name "${safePdf}" file format format PDF
end tell
```
**Error**: `-1708` same as Attempt 1.  
**Analysis**: `save as` is defined in Word's AppleScript dictionary as an application-level command, not a document-level command. Sending it via `tell theDoc` is semantically wrong — the document object still doesn't handle it. Same error regardless of dispatch method.

---

### Attempt 4 — `export as fixed format` with explicit PDF format
```applescript
export as fixed format theDoc output file name "${safePdf}" export format export format PDF
```
**Error**: `-2741` "script error: Expected end of line, etc. but found property."  
**Analysis**: COMPILE-TIME syntax error — not even a runtime error. The problem is `export format export format PDF`: `export format` is both the parameter label AND the enumeration type prefix. The AppleScript parser sees the second `export` keyword and gets confused, treating `format` as an unexpected token. Cannot be caught with `try/on error`.

---

### Attempt 5 — `export as fixed format` WITHOUT format parameter (current)
```applescript
export as fixed format theDoc output file name "${safePdf}"
```
**Status**: Just deployed, not yet tested.  
**Theory**: `export as fixed format` in Word's VBA/AppleScript is specifically the PDF/XPS export command. Omitting `export format` might cause it to default to PDF (wdExportFormatPDF = 17).  
**Risk**: Might default to XPS instead of PDF, or might error requiring the parameter.

---

## Ideas NOT YET Tried

### Option A — `export format PDF` (just `PDF`, no type prefix)
```applescript
export as fixed format theDoc output file name "${safePdf}" export format PDF
```
Theory: In Word's AppleScript dictionary, the `export format` enumeration values might be named just `PDF` and `XPS` (without the type prefix). If so, `export format PDF` would parse correctly (label=`export format`, value=`PDF`).

### Option B — `export format wdExportFormatPDF` (VBA constant name)
```applescript
export as fixed format theDoc output file name "${safePdf}" export format wdExportFormatPDF
```
Theory: Word might expose VBA constant names directly in AppleScript.

### Option C — Numeric constant (wdExportFormatPDF = 17)
```applescript
export as fixed format theDoc output file name "${safePdf}" export format 17
```
Theory: AppleScript allows passing raw integers for enumeration parameters. 17 is the numeric value of `wdExportFormatPDF`.

### Option D — JXA (JavaScript for Automation) instead of AppleScript
Run with `osascript -l JavaScript`. Different bridge to Word API.
```javascript
var word = Application("Microsoft Word");
var theDoc = word.activeDocument();
theDoc.saveAs({ fileName: "path.pdf", fileFormat: 17 });
theDoc.close({ saving: 0 });
```
Caveat: JXA uses the SAME underlying AppleScript dictionary, so if `save as` is broken in AppleScript it will likely be broken in JXA too. However, `exportAsFixedFormat` in JXA might have different parameter handling.

### Option E — Check Word's actual dictionary via `sdef`
Run in terminal:
```bash
sdef /Applications/Microsoft\ Word.app | grep -A5 "export as fixed"
sdef /Applications/Microsoft\ Word.app | grep -A5 "save as"
```
This dumps Word's actual AppleScript dictionary so we can see exact command/parameter names without guessing.

### Option F — `save as` without document reference (implicit active document)
```applescript
tell application "Microsoft Word"
  open POSIX file "${safeDocx}"
  delay 3
  save as file name "${safePdf}" file format format PDF
  close active document saving no
end tell
```
No `set theDoc`, no explicit document reference. `save as` with no direct object might implicitly target the active document differently.

### Option G — Activate Word before operations
```applescript
tell application "Microsoft Word"
  activate
  open POSIX file "${safeDocx}"
  delay 3
  set theDoc to active document
  save as theDoc file name "${safePdf}" file format format PDF
  close theDoc saving no
end tell
```
Theory: When `set visible to false`, Word may not fully initialize the document object, causing `save as` to fail. Forcing activation and visibility might fix the -1708 error.

### Option H — sdef dictionary inspection first
Before trying more blind guesses, inspect Word's actual AppleScript dictionary using `sdef` (see Option E). This will give us exact command names, parameter labels, and enumeration values.

---

## Key Unknowns
1. What version of Word 365 is installed? (Check: Word menu → About Microsoft Word)
2. Does Word's `sdef` expose `export as fixed format`? What parameter names does it use?
3. Does `set visible to false` affect Word's ability to process commands?

---

## Recommended Next Step
Run `sdef /Applications/Microsoft\ Word.app | grep -A 10 "export as fixed"` in Terminal to see the EXACT AppleScript definition before guessing further.

// ── macOS text recognition for scanned pages ─────────────────────────────────
// Drafto's bundled OCR (Tesseract + Python) is Windows-only. On a Mac a scanned
// page would otherwise have to be sent to the model as an image, which costs
// materially more for the same document.
//
// macOS has had accurate text recognition built in since Catalina (the Vision
// framework). It needs nothing bundled and no Xcode: `osascript -l JavaScript`
// exposes the ObjC bridge, so a short script can render a PDF page and run the
// recogniser over it.
//
// Everything here is best-effort. If the script fails for any reason — an older
// macOS, a locked-down machine, a malformed PDF — the caller simply falls back
// to the image path, exactly as before.

const { execFile } = require("child_process");
const os = require("os");

/** Vision is available from macOS 10.15. Darwin 19 = Catalina. */
function macSupportsVision() {
  if (process.platform !== "darwin") return false;
  const major = Number(String(os.release()).split(".")[0]);
  return Number.isFinite(major) && major >= 19;
}

// JXA: render the given 1-indexed PDF pages and run Vision over each, printing
// one page per record. Written as a single string so nothing has to be shipped
// alongside the app.
const JXA = `
ObjC.import('Cocoa');
ObjC.import('Quartz');
ObjC.import('Vision');

function run(argv) {
  var pdfPath = argv[0];
  var pages = argv.slice(1).map(function (p) { return parseInt(p, 10); });
  var doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(pdfPath)));
  if (!doc || doc.isNil()) { return ''; }

  var out = [];
  for (var i = 0; i < pages.length; i++) {
    var idx = pages[i] - 1;
    if (idx < 0 || idx >= doc.pageCount) { continue; }
    try {
      var page = doc.pageAtIndex(idx);
      var img = $.NSImage.alloc.initWithData(page.dataRepresentation);
      if (!img || img.isNil()) { continue; }
      var bmp = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation);
      if (!bmp || bmp.isNil()) { continue; }

      var handler = $.VNImageRequestHandler.alloc.initWithCGImageOptions(bmp.CGImage, $());
      var req = $.VNRecognizeTextRequest.alloc.init;
      req.recognitionLevel = 0;          // accurate
      req.usesLanguageCorrection = true;
      // Indian paper-books are usually English, often with Devanagari. Ask for
      // both where the OS supports it; an unsupported language would throw, so
      // fall back to the default (English) rather than lose the page.
      try { req.recognitionLanguages = $(['en-IN', 'en-US', 'hi-IN']); }
      catch (e) { try { req.recognitionLanguages = $(['en-US']); } catch (e2) {} }

      handler.performRequestsError($([req]), $());
      var res = req.results;
      if (!res || res.isNil()) { continue; }
      var lines = [];
      for (var r = 0; r < res.count; r++) {
        var top = res.objectAtIndex(r).topCandidates(1);
        if (top && !top.isNil() && top.count > 0) {
          lines.push(ObjC.unwrap(top.objectAtIndex(0).string));
        }
      }
      if (lines.length > 0) {
        out.push('<<<DRAFTO_PAGE ' + pages[i] + '>>>\\n' + lines.join('\\n'));
      }
    } catch (e) { /* skip this page */ }
  }
  return out.join('\\n');
}
`;

/**
 * Recognise text on specific pages of a PDF.
 * @returns {Promise<Record<number,string>>} page number → text (empty when unavailable)
 */
function recognisePdfPages(pdfPath, pages, timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (!macSupportsVision() || !Array.isArray(pages) || pages.length === 0) {
      resolve({});
      return;
    }
    const args = ["-l", "JavaScript", "-e", JXA, pdfPath, ...pages.map(String)];
    execFile("osascript", args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) { resolve({}); return; }
      const out = {};
      const chunks = String(stdout).split(/<<<DRAFTO_PAGE (\d+)>>>\n?/);
      // split() yields ["", "3", "text", "4", "text", …]
      for (let i = 1; i < chunks.length; i += 2) {
        const pageNo = Number(chunks[i]);
        const text = (chunks[i + 1] || "").trim();
        if (Number.isFinite(pageNo) && text) out[pageNo] = text;
      }
      resolve(out);
    });
  });
}

module.exports = { macSupportsVision, recognisePdfPages };

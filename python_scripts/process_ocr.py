#!/usr/bin/env python3
"""
OCR Processing Script for Drafto
Uses PyMuPDF + pytesseract to add OCR layer to PDF files.
No Ghostscript dependency.
"""

import sys
import os
import io

def process_ocr(input_pdf, output_pdf):
    """
    Process a PDF file and add OCR layer using PyMuPDF + pytesseract.
    No Ghostscript required.

    Args:
        input_pdf: Path to input PDF file
        output_pdf: Path to output PDF file
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("ERROR: pymupdf not found. Run: pip install pymupdf", file=sys.stderr)
        sys.exit(1)

    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        print("ERROR: pytesseract/Pillow not found. Run: pip install pytesseract pillow", file=sys.stderr)
        sys.exit(1)

    # Locate tesseract.exe explicitly (pytesseract doesn't reliably pick up PATH on Windows)
    def _find_tesseract():
        # 1. Honour an explicit env var set by the Electron host
        explicit = os.environ.get('TESSERACT_EXE')
        if explicit and os.path.isfile(explicit):
            return explicit
        # 2. Search every directory on the current PATH
        for directory in os.environ.get('PATH', '').split(os.pathsep):
            candidate = os.path.join(directory.strip(), 'tesseract.exe')
            if os.path.isfile(candidate):
                return candidate
        # 3. Well-known Windows install locations
        well_known = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Tesseract-OCR', 'tesseract.exe'),
        ]
        for wk in well_known:
            if os.path.isfile(wk):
                return wk
        return None

    tess_exe = _find_tesseract()
    if not tess_exe:
        print("ERROR: tesseract.exe not found. Install Tesseract OCR and ensure it is on PATH.", file=sys.stderr)
        sys.exit(1)
    pytesseract.pytesseract.tesseract_cmd = tess_exe
    print(f"Using Tesseract: {tess_exe}")

    try:
        import pikepdf
    except ImportError:
        print("ERROR: pikepdf not found. Run: pip install pikepdf", file=sys.stderr)
        sys.exit(1)

    try:
        # Check if input file exists
        if not os.path.exists(input_pdf):
            print(f"ERROR: Input file not found: {input_pdf}", file=sys.stderr)
            sys.exit(1)

        print(f"Processing OCR for: {input_pdf}")

        # Open PDF with PyMuPDF
        doc = fitz.open(input_pdf)
        total_pages = len(doc)
        print(f"Total pages: {total_pages}", flush=True)

        # Preserve bookmarks before processing (uses page numbers, so survives rebuild)
        toc = doc.get_toc(simple=False)
        if toc:
            print(f"Found {len(toc)} bookmark entries to preserve", flush=True)

        # Also open the source with pikepdf for per-page fallback
        src_pikepdf = pikepdf.Pdf.open(input_pdf)

        # Merge pages incrementally into pikepdf to avoid holding all in memory
        merged = pikepdf.Pdf.new()
        skipped = []

        for page_num in range(total_pages):
            page = doc[page_num]

            try:
                # Render at 200 DPI — good enough for OCR, significantly faster than 300
                mat = fitz.Matrix(200 / 72, 200 / 72)
                pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                img = Image.open(io.BytesIO(pix.tobytes("png")))

                # pytesseract creates a searchable single-page PDF (image + invisible text)
                pdf_bytes = pytesseract.image_to_pdf_or_hocr(img, extension='pdf', lang='eng')

                src = pikepdf.Pdf.open(io.BytesIO(pdf_bytes))
                merged.pages.extend(src.pages)
                src.close()

            except Exception as page_err:
                # Tesseract failed on this page — fall back to original page without OCR
                print(f"  Warning: OCR failed on page {page_num + 1}, using original: {page_err}", flush=True)
                skipped.append(page_num + 1)
                tmp_single = pikepdf.Pdf.new()
                tmp_single.pages.append(src_pikepdf.pages[page_num])
                buf = io.BytesIO()
                tmp_single.save(buf)
                buf.seek(0)
                fallback = pikepdf.Pdf.open(buf)
                merged.pages.extend(fallback.pages)
                fallback.close()
                tmp_single.close()

            if (page_num + 1) % 10 == 0 or (page_num + 1) == total_pages:
                print(f"  Processed {page_num + 1}/{total_pages} pages", flush=True)

        doc.close()
        src_pikepdf.close()

        if skipped:
            print(f"  Note: {len(skipped)} page(s) kept without OCR text: {skipped[:10]}", flush=True)
        merged.save(output_pdf)
        merged.close()

        # Re-apply bookmarks to the output PDF using PyMuPDF
        # (pikepdf page rebuild strips the outline; PyMuPDF set_toc restores it)
        if toc:
            try:
                out_doc = fitz.open(output_pdf)
                out_doc.set_toc(toc)
                # Save to a temp file then replace (saveIncr can fail on rebuilt PDFs)
                tmp_output = output_pdf + ".tmp.pdf"
                out_doc.save(tmp_output)
                out_doc.close()
                os.replace(tmp_output, output_pdf)
                print(f"Bookmarks restored ({len(toc)} entries)", flush=True)
            except Exception as bm_err:
                print(f"Warning: Could not restore bookmarks: {bm_err}", flush=True)

        print(f"OCR processing completed successfully")
        print(f"Output saved to: {output_pdf}")

    except Exception as e:
        print(f"ERROR during OCR processing: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python process_ocr.py <input_pdf> <output_pdf>", file=sys.stderr)
        sys.exit(1)
    
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    
    process_ocr(input_pdf, output_pdf)

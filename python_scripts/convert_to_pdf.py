#!/usr/bin/env python3
"""
DOCX to PDF Converter.

On Windows this drives Microsoft Word directly via COM (pywin32) with hardening
that clears the most common failure modes behind the cryptic
"Conversion failed: Open.SaveAs" error:
  - a stray/locked WINWORD.EXE left over from a previous crash,
  - Word startup modal dialogs (activation, "Safe Mode" recovery, "first run"),
    which silently block the SaveAs COM call,
  - a corrupted/automation-hostile default profile.
It disables alerts, runs Word invisibly, retries once after killing stray
instances, and emits a plain-language error if Word genuinely can't be driven
(at which point the caller falls back to bundled LibreOffice).

If pywin32 is unavailable it falls back to the docx2pdf library.

Usage:
    python convert_to_pdf.py <input_docx_path> <output_pdf_path>
"""

import sys
import os
import time
import subprocess


WD_FORMAT_PDF = 17  # wdFormatPDF


def _kill_stray_word():
    """Best-effort: terminate orphaned WINWORD.EXE instances that block COM."""
    try:
        subprocess.run(
            ["taskkill", "/F", "/IM", "WINWORD.EXE"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
        )
    except Exception:
        pass


def _convert_with_word(docx_path: str, pdf_path: str) -> None:
    """Convert via Word COM automation, hardened against startup dialogs."""
    import win32com.client
    import pythoncom
    from win32com.client import constants  # noqa: F401

    pythoncom.CoInitialize()
    word = None
    doc = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        # Run invisibly and suppress every modal dialog that would otherwise
        # block the automation thread (the real cause of Open.SaveAs hangs).
        try:
            word.Visible = False
        except Exception:
            pass
        try:
            word.DisplayAlerts = 0  # wdAlertsNone
        except Exception:
            pass
        try:
            # msoAutomationSecurityForceDisable = 3 — never run macros/prompts.
            word.AutomationSecurity = 3
        except Exception:
            pass

        # Open read-only, without recovery/repair prompts.
        doc = word.Documents.Open(
            os.path.abspath(docx_path),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False,
        )
        doc.SaveAs(os.path.abspath(pdf_path), FileFormat=WD_FORMAT_PDF)
    finally:
        try:
            if doc is not None:
                doc.Close(False)
        except Exception:
            pass
        try:
            if word is not None:
                word.Quit()
        except Exception:
            pass
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


def _convert_with_docx2pdf(docx_path: str, pdf_path: str) -> None:
    from docx2pdf import convert
    convert(docx_path, pdf_path)


def convert_docx_to_pdf(docx_path: str, pdf_path: str) -> None:
    if not os.path.exists(docx_path):
        raise FileNotFoundError(f"Input DOCX file not found: {docx_path}")

    output_dir = os.path.dirname(pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    is_windows = sys.platform.startswith("win")

    last_error = None
    if is_windows:
        # Try Word via COM, retrying once after clearing stray instances.
        try:
            import win32com.client  # noqa: F401
            have_win32 = True
        except ImportError:
            have_win32 = False

        if have_win32:
            for attempt in range(2):
                try:
                    _convert_with_word(docx_path, pdf_path)
                    if os.path.exists(pdf_path):
                        print("SUCCESS")
                        return
                    last_error = "Word reported success but no PDF was written."
                except Exception as e:  # noqa: BLE001
                    last_error = str(e)
                # Clear whatever wedged Word and try one more time.
                _kill_stray_word()
                time.sleep(1.5)

        # Fall back to docx2pdf (also Word-backed, but a different code path).
        try:
            _convert_with_docx2pdf(docx_path, pdf_path)
            if os.path.exists(pdf_path):
                print("SUCCESS")
                return
            last_error = last_error or "docx2pdf produced no output file."
        except ImportError:
            pass
        except Exception as e:  # noqa: BLE001
            last_error = str(e)

        raise Exception(
            "Microsoft Word could not be automated to create the PDF "
            f"({last_error or 'unknown error'}). Make sure Word is installed and "
            "not showing a startup dialog. Drafto will now try LibreOffice instead."
        )

    # Non-Windows (Linux): docx2pdf only.
    try:
        _convert_with_docx2pdf(docx_path, pdf_path)
    except ImportError:
        raise ImportError(
            "docx2pdf library is not installed. Install it with: pip install docx2pdf"
        )
    except Exception as e:  # noqa: BLE001
        raise Exception(f"Conversion failed: {str(e)}")

    if not os.path.exists(pdf_path):
        raise Exception("PDF conversion appeared to succeed but output file was not created")
    print("SUCCESS")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("ERROR: Invalid arguments", file=sys.stderr)
        print("Usage: python convert_to_pdf.py <input_docx_path> <output_pdf_path>", file=sys.stderr)
        sys.exit(1)

    docx_path = sys.argv[1]
    pdf_path = sys.argv[2]

    try:
        convert_docx_to_pdf(docx_path, pdf_path)
        sys.exit(0)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)

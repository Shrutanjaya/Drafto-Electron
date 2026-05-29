#!/usr/bin/env python3
"""
DOCX to PDF Converter using docx2pdf
This script is called by the Node.js application to convert DOCX files to PDF
using Microsoft Word (Windows) or LibreOffice (Mac) via the docx2pdf library.

Usage:
    python convert_to_pdf.py <input_docx_path> <output_pdf_path>

Requirements:
    pip install docx2pdf
    
    Windows: Requires Microsoft Word to be installed
    Mac: Requires Microsoft Word or LibreOffice to be installed
"""

import sys
import os
from pathlib import Path

def convert_docx_to_pdf(docx_path: str, pdf_path: str) -> None:
    """
    Convert a DOCX file to PDF using docx2pdf library.
    
    Args:
        docx_path: Path to the input DOCX file
        pdf_path: Path where the output PDF should be saved
    
    Raises:
        FileNotFoundError: If the input DOCX file doesn't exist
        Exception: If conversion fails
    """
    # Verify input file exists
    if not os.path.exists(docx_path):
        raise FileNotFoundError(f"Input DOCX file not found: {docx_path}")
    
    # Import docx2pdf here so we can provide a better error message if it's not installed
    try:
        from docx2pdf import convert
    except ImportError:
        raise ImportError(
            "docx2pdf library is not installed. "
            "Please install it using: pip install docx2pdf"
        )
    
    # Ensure output directory exists
    output_dir = os.path.dirname(pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # Perform conversion
    try:
        convert(docx_path, pdf_path)
        
        # Verify the PDF was created
        if not os.path.exists(pdf_path):
            raise Exception("PDF conversion appeared to succeed but output file was not created")
            
        print("SUCCESS")
        
    except Exception as e:
        raise Exception(f"Conversion failed: {str(e)}")


if __name__ == "__main__":
    # Check command line arguments
    if len(sys.argv) != 3:
        print("ERROR: Invalid arguments", file=sys.stderr)
        print("Usage: python convert_to_pdf.py <input_docx_path> <output_pdf_path>", file=sys.stderr)
        sys.exit(1)
    
    docx_path = sys.argv[1]
    pdf_path = sys.argv[2]
    
    try:
        convert_docx_to_pdf(docx_path, pdf_path)
        sys.exit(0)
        
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        sys.exit(1)

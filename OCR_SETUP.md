# OCR Setup Guide for Drafto

## Overview
Drafto includes OCR (Optical Character Recognition) functionality to make scanned documents searchable. This feature requires additional setup.

## Requirements

### 1. Install Tesseract OCR

**Windows:**
1. Download Tesseract installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Run the installer and install to default location: `C:\Program Files\Tesseract-OCR`
3. Add Tesseract to PATH or note the installation directory

### 2. Install Python Dependencies

The bundled Python needs the `ocrmypdf` package:

```bash
# Navigate to bundled Python
cd "C:\Program Files\Drafto\resources\python"

# Install ocrmypdf
.\python.exe -m pip install ocrmypdf
```

## Bundling for Distribution

To bundle OCR with the installer:

### 1. Install Dependencies in Development Python

```bash
cd Drafto-Electron\python
.\python.exe -m pip install ocrmypdf pytesseract Pillow
```

### 2. Bundle Tesseract with Installer

Add Tesseract to the installer by:
1. Download Tesseract portable version
2. Extract to `Drafto-Electron\tesseract\`
3. Update `package.json` to include tesseract in extraResources

### 3. Update main.js

Add Tesseract path detection in main.js to check bundled version first.

## Usage

In the PDF Generation dialog, check the "Enable OCR" checkbox before generating the PDF.

## Troubleshooting

- **OCR fails**: Ensure Tesseract is installed and accessible
- **Slow processing**: OCR can take 1-2 minutes for large documents
- **Already searchable PDFs**: OCR will skip pages that already have text

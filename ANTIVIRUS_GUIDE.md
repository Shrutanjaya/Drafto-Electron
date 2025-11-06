# Antivirus & SmartScreen Guide

## Why am I seeing security warnings?

Drafto is a legitimate application, but you may see warnings from Windows SmartScreen or antivirus software for these reasons:

1. **New Application** - Drafto is relatively new and hasn't established reputation with Microsoft SmartScreen yet
2. **Bundled Python** - The app includes Python for PDF generation, which some antivirus software flags as suspicious
3. **Unsigned Certificate** - The app is not yet code-signed with an expensive certificate (planned for future releases)

## Is Drafto Safe?

**Yes!** Drafto is completely safe and open-source:
- **Source Code Available**: https://github.com/Shrutanjaya/Drafto-Electron
- **No Malware**: The app only accesses files you explicitly open/save
- **No Data Collection**: Everything stays on your computer
- **Transparent**: All code is publicly visible on GitHub

## How to Install Despite Warnings

### Windows SmartScreen Warning

If you see "Windows protected your PC" message:

1. Click **"More info"**
2. Click **"Run anyway"**

This is safe - Windows shows this for any new application without an expensive code-signing certificate.

### Antivirus Warnings

If your antivirus blocks installation:

#### Windows Defender
1. Open **Windows Security** → **Virus & threat protection**
2. Click **Manage settings** under "Virus & threat protection settings"
3. Scroll to **Exclusions** → Click **Add or remove exclusions**
4. Click **Add an exclusion** → **Folder**
5. Browse to where you installed Drafto (usually `C:\Users\[YourName]\AppData\Local\Programs\Drafto`)
6. Reinstall or run Drafto

#### Other Antivirus Software (Norton, McAfee, Avast, etc.)
1. Open your antivirus software
2. Look for **Settings** or **Exceptions/Exclusions**
3. Add the Drafto installation folder to exceptions
4. Add the installer file (`Drafto-Setup-x.x.x.exe`) to exceptions
5. Reinstall or run Drafto

### Specific Antivirus Solutions

#### Norton
1. Open Norton
2. Go to **Settings** → **Antivirus** → **Scans and Risks** → **Exclusions / Low Risks**
3. Click **Configure** next to Items to Exclude from Scans
4. Add Drafto folder

#### McAfee
1. Open McAfee
2. Go to **PC Security** → **Real-Time Scanning** → **Excluded Files**
3. Add Drafto installation folder

#### Avast
1. Open Avast
2. Go to **Menu** → **Settings** → **General** → **Exceptions**
3. Click **Add Exception**
4. Browse to Drafto folder

#### AVG
1. Open AVG
2. Go to **Menu** → **Settings** → **General** → **Exceptions**
3. Click **Add Exception**
4. Browse to Drafto folder

## What Drafto Actually Does

Drafto needs these permissions:
- **Read/Write Files**: To open, edit, and save your legal documents
- **Run Python**: To convert DOCX documents to PDF using Microsoft Word/LibreOffice
- **Internet Access**: Only for checking for updates (optional)
- **File System Access**: To save your drafts and projects

## Verify the Download

You can verify your download is legitimate:

1. **Download Only from GitHub**: https://github.com/Shrutanjaya/Drafto-Electron/releases
2. **Check File Hash**: Compare the SHA256 hash of your downloaded file with the one on GitHub
3. **Review Source Code**: All code is open-source and auditable

## Future Plans

We plan to obtain a code-signing certificate in future releases, which will:
- Eliminate SmartScreen warnings
- Reduce false positives from antivirus software
- Show "Drafto Team" as the verified publisher

## Still Concerned?

If you're still concerned about security:

1. **Review the Source Code**: Check our GitHub repository
2. **Run in Sandbox**: Use Windows Sandbox or a virtual machine for testing
3. **Scan the Files**: Use VirusTotal.com to scan the installer
4. **Contact Us**: Open an issue on GitHub with your concerns

## Technical Details

For transparency, here's what the installer contains:
- Electron app framework (open-source)
- Next.js web application (your documents)
- Python 3.13.0 embeddable (for PDF generation)
- docx2pdf library (for document conversion)
- Required Windows DLLs

All components are legitimate, open-source, or standard Windows libraries.

---

**Thank you for using Drafto!**

If you find this guide helpful, please star our repository: https://github.com/Shrutanjaya/Drafto-Electron

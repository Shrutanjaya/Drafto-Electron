# Drafto v1.0.8 - Diagnostic Build Guide

## What's New in v1.0.8

This is a **diagnostic build** designed to help troubleshoot startup issues, particularly the "blank white screen" problem.

### New Features

1. **Splash Screen with Progress**
   - Shows startup progress with percentage
   - Displays current operation (Python check, server start, etc.)
   - Shows detailed status messages
   - Beautiful gradient design

2. **Enhanced Error Handling**
   - Detects when page fails to load
   - Shows helpful error message in window
   - Provides troubleshooting steps
   - Logs all errors to console

3. **Server Health Check**
   - Waits for Next.js server to actually respond (up to 30 seconds)
   - Checks server health before opening window
   - Prevents blank screen from loading too early

4. **Better Logging**
   - Detailed console logs for every step
   - Shows Python detection status
   - Shows PDF converter detection
   - Shows server startup progress

5. **OCR Support (Optional)**
   - Added checkbox in PDF Generation dialog
   - Can make scanned documents searchable
   - Requires additional setup (see OCR_SETUP.md)

### Diagnostic Features

#### Splash Screen Progress Stages:
- **0-10%**: Checking Python installation
- **10-25%**: Installing dependencies if needed
- **25-35%**: Checking PDF converter (MS Word/LibreOffice)
- **35-40%**: Starting Next.js server
- **40-90%**: Waiting for server to respond
- **90-95%**: Creating application window
- **95-100%**: Opening main interface

#### If It Fails:
- Splash shows error message
- Error dialog appears with specific error
- Console shows detailed logs

### How to Use This Build for Troubleshooting

#### Method 1: Run from Command Prompt (Recommended)
```cmd
cd "C:\Program Files\Drafto"
Drafto.exe
```
This will show console output with all diagnostic information.

#### Method 2: Check Event Viewer
1. Open Windows Event Viewer
2. Navigate to: Windows Logs → Application
3. Look for "Electron" or "Drafto" entries
4. Check error details

#### What to Look For:

**If splash shows "Checking Python...":**
- Python installation issue
- Check if bundled Python exists

**If splash shows "Starting server..." and hangs:**
- Port 9002 might be in use
- Check: `netstat -ano | findstr :9002`
- Node.js/npm might be missing

**If splash shows "Waiting for server..." for >30 seconds:**
- Next.js server failed to start
- Check Firebase Files folder exists
- Check node_modules are present

**If window shows but is blank:**
- JavaScript errors in renderer
- Check browser console (F12 in dev mode)

### Common Issues & Solutions

#### Issue: "Server failed to start"
**Solution:**
1. Check if port 9002 is available
2. Run: `netstat -ano | findstr :9002`
3. If in use, kill that process or change port in main.js

#### Issue: Splash stays at "Checking Python..."
**Solution:**
1. Python detection is failing
2. Check if `C:\Program Files\Drafto\resources\python\python.exe` exists
3. Try reinstalling

#### Issue: Antivirus blocking
**Solution:**
1. Temporarily disable antivirus
2. Add Drafto to whitelist
3. See ANTIVIRUS_GUIDE.md

### Collecting Diagnostic Information

If you need to send logs to support:

1. **Run from Command Prompt** and copy all console output
2. **Take screenshot** of splash screen if it shows error
3. **Check Windows Event Viewer** for application errors
4. **Run these commands** and share output:
   ```cmd
   netstat -ano | findstr :9002
   tasklist | findstr Drafto
   dir "C:\Program Files\Drafto\resources\python"
   ```

### Reverting to Stable Build

If this diagnostic build causes issues:
1. Uninstall v1.0.8
2. Install v1.0.7 (stable)
3. Report issues to support

### What Happens Next

Based on diagnostic information collected from this build:
- We can identify the exact failure point
- Fix the root cause
- Release stable v1.0.8 with fixes

## Differences from v1.0.7

| Feature | v1.0.7 | v1.0.8 |
|---------|--------|--------|
| Splash Screen | No | Yes with progress |
| Server Health Check | Timeout only | Active HTTP check |
| Error Handling | Basic | Enhanced with UI feedback |
| Logging | Minimal | Detailed at every step |
| OCR Support | No | Yes (optional) |
| Load Failure Detection | No | Yes with helpful message |

## Installation

Install like any other version:
1. Run `Drafto-Setup-1.0.8.exe`
2. Follow installation wizard
3. Watch splash screen progress
4. If it fails, note the error message

## Feedback

Please report:
- Where splash screen stopped
- What error message appeared
- Console output if available
- Screenshots of errors

This will help us fix the blank screen issue permanently!

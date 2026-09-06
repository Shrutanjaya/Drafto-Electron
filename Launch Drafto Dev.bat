@echo off
title Drafto Dev Mode
echo ===================================================
echo   Starting Drafto in Development Mode...
echo ===================================================
cd /d "%~dp0"
npm run electron:dev
pause

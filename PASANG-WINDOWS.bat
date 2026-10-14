@echo off
title Pasang Meow Corner
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pasang-windows.ps1"
echo.
pause

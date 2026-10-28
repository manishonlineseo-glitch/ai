@echo off
rem Re-pair this PC with Jarvis using a one-time code (Jarvis site > Devices > Code banao).
title Jarvis pair
cd /d "%~dp0"
set JARVIS_AGENT_HOME=%~dp0
"%~dp0venv\Scripts\python.exe" "%~dp0jarvis_app.py" --setup
echo.
echo Ab start_agent.bat chalao.
pause

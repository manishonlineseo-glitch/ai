@echo off
rem Double-click to start the Jarvis PC agent. Keep this window open; closing it stops the agent.
rem If the agent crashes it restarts itself after 5 seconds.
rem If the server rejects the token (exit code 2) it stops: pair again with "pair_agent.bat".
title Jarvis PC agent
cd /d "%~dp0"
:loop
"%~dp0venv\Scripts\python.exe" "%~dp0agent.py"
if %errorlevel%==2 (
  echo.
  echo Token reject hua. Jarvis site ^> Devices ^> "Code banao" dabao, phir pair_agent.bat chalao aur code daalo.
  pause
  exit /b 2
)
echo.
echo Agent band ho gaya (upar error dekho). 5 second me dobara chalu hoga. Band karna ho to ye window band karo.
timeout /t 5 /nobreak >nul
goto loop

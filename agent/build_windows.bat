@echo off
rem Builds dist\JarvisAgent.exe (one file, no console window). Needs the agent venv: pip install -r requirements.txt pyinstaller pystray
cd /d "%~dp0"
venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --noconsole --name JarvisAgent ^
  --hidden-import pystray._win32 --hidden-import pyttsx3.drivers --hidden-import pyttsx3.drivers.sapi5 ^
  --collect-submodules comtypes --collect-all uiautomation --collect-all pystray --collect-all soundcard --hidden-import callrun --hidden-import ops --collect-submodules websockets --exclude-module cryptography jarvis_app.py
echo.
echo Done: %~dp0dist\JarvisAgent.exe

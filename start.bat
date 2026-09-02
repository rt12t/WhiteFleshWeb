@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要安装 Node.js: https://nodejs.org/
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:4173/"
node server.mjs
pause

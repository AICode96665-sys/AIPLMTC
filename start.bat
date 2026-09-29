@echo off
setlocal
title TC SOA Studio
cd /d "%~dp0"

echo ==========================================================
echo   TC SOA Studio - start from source
echo ==========================================================
echo.

rem --- 1. Node.js -----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto :no_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
if errorlevel 1 goto :old_node

rem --- 2. Ollama and the AI model -----------------------------------------
where ollama >nul 2>nul
if errorlevel 1 goto :no_ollama
ollama list 2>nul | findstr /i /c:"qwen2.5-coder:1.5b" >nul
if not errorlevel 1 goto :install
echo [!] The AI model qwen2.5-coder:1.5b is not installed yet - about 1 GB.
choice /c YN /m "    Download it now"
if errorlevel 2 goto :install
ollama pull qwen2.5-coder:1.5b
echo.
goto :install

:no_ollama
echo [!] Ollama was not found. The app needs it for the AI.
echo     Install it from https://ollama.com and then run:
echo         ollama pull qwen2.5-coder:1.5b
echo     Continuing - the app will show the same setup help.
echo.

rem --- 3. Components - first run only ------------------------------------
:install
if exist "node_modules\" goto :run
echo Installing components - first run only, this can take a few minutes...
call npm install
if errorlevel 1 goto :failed_install
echo.

rem --- 4. Build and start --------------------------------------------------
:run
rem Some npm versions skip Electron's own download step - make sure it's there.
if exist "node_modules\electron\dist\electron.exe" goto :start_app
echo Downloading Electron - first run only...
call node node_modules\electron\install.js
if errorlevel 1 goto :failed_install

:start_app
echo Building and starting TC SOA Studio...
call npm start
if errorlevel 1 goto :failed_start
goto :eof

:no_node
echo [X] Node.js is not installed.
echo     Install the LTS version from https://nodejs.org and run this file again.
goto :stop

:old_node
echo [X] Your Node.js version is too old - this app needs 20.19 or newer, 22 LTS recommended.
echo     Install the LTS version from https://nodejs.org and run this file again.
goto :stop

:failed_install
echo [X] Installing components failed. Check your internet connection and try again.
goto :stop

:failed_start
echo [X] The app could not start. See the messages above.
goto :stop

:stop
echo.
pause
exit /b 1

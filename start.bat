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

rem --- 2. Ollama: installed? ------------------------------------------------
where ollama >nul 2>nul
if not errorlevel 1 goto :ollama_running
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
  set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
  goto :ollama_running
)
echo [!] Ollama is not installed. The app needs it: it runs the AI model on this PC.
where winget >nul 2>nul
if errorlevel 1 goto :ollama_open_site
echo     Installing it automatically in 10 seconds - press N to skip, Y to start now.
choice /c YN /t 10 /d Y /m "    Install Ollama now"
if errorlevel 2 goto :ollama_later
echo     Installing Ollama with winget - follow any prompts below...
winget install --id Ollama.Ollama -e
if errorlevel 1 goto :ollama_open_site
rem A fresh install is not on PATH in this window yet.
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
where ollama >nul 2>nul
if errorlevel 1 goto :ollama_restart
echo.
goto :ollama_running

:ollama_open_site
echo     Opening the Ollama download page. Install it, then run this file again.
start "" "https://ollama.com/download"
goto :ollama_skip

:ollama_later
echo     OK - you can install it later from https://ollama.com

:ollama_skip
echo     Continuing - the app will show the same setup help.
echo.
goto :install

:ollama_restart
echo Ollama was installed. Close this window and run start.bat again.
goto :stop

rem --- 3. Ollama: running? -------------------------------------------------
:ollama_running
call :ollama_ping
if not errorlevel 1 goto :check_model
echo Starting Ollama...
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
  start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
) else (
  start "Ollama" /min ollama serve
)
for /l %%i in (1,1,30) do (
  call :ollama_ping
  if not errorlevel 1 goto :check_model
  ping -n 2 127.0.0.1 >nul
)
echo [!] Ollama did not start. Start "Ollama" from the Start menu.
echo     Continuing - the app will show setup help.
echo.
goto :install

rem --- 4. The AI model ---------------------------------------------------------
:check_model
ollama list 2>nul | findstr /i /c:"qwen2.5-coder:1.5b" >nul
if not errorlevel 1 goto :install
echo Downloading the AI model qwen2.5-coder:1.5b - about 1 GB, first time only...
ollama pull qwen2.5-coder:1.5b
if errorlevel 1 (
  echo [!] The model download did not finish. The app will try again when it opens.
)
echo.

rem --- 5. Components - first run only ------------------------------------
:install
if exist "node_modules\" goto :run
echo Installing components - first run only, this can take a few minutes...
call npm install
if errorlevel 1 goto :failed_install
echo.

rem --- 6. Build and start --------------------------------------------------
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

rem --- helpers and errors --------------------------------------------------
:ollama_ping
rem Is the local Ollama server answering? (errorlevel 0 = yes)
curl -s -o nul --max-time 2 http://127.0.0.1:11434/api/version >nul 2>nul
exit /b %errorlevel%

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

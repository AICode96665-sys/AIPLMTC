@echo off
setlocal EnableExtensions
title TC SOA Studio
cd /d "%~dp0"

echo ==========================================================
echo   TC SOA Studio - setup and start
echo   Installs anything missing: Node.js, Ollama, the AI model
echo ==========================================================
echo.

rem --- 0. Sanity checks ----------------------------------------------------
if not exist "package.json" goto :not_extracted

set "FREE_GB="
for /f "usebackq" %%g in (`powershell -NoProfile -Command "[math]::Floor((Get-PSDrive -Name ('%~d0'.TrimEnd(':'))).Free/1GB)" 2^>nul`) do set "FREE_GB=%%g"
if defined FREE_GB if %FREE_GB% LSS 4 goto :low_disk

rem --- 1. Node.js ------------------------------------------------------------
echo [1/5] Checking Node.js...
call :find_node
if errorlevel 1 goto :install_node
call :node_version_ok
if errorlevel 1 goto :install_node
goto :node_ok

:install_node
echo       Node.js 20.19 or newer is needed - installing Node.js LTS.
echo       Windows may ask for permission: click Yes.
where winget >nul 2>nul
if errorlevel 1 goto :no_winget_node
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
call :find_node
if errorlevel 1 goto :node_restart
call :node_version_ok
if errorlevel 1 goto :node_restart

:node_ok
echo       OK
echo.

rem --- 2. Ollama: installed? -----------------------------------------------
echo [2/5] Checking Ollama - it runs the AI on this PC...
call :find_ollama
if not errorlevel 1 goto :ollama_running
echo       Ollama is not installed - installing it now.
where winget >nul 2>nul
if errorlevel 1 goto :no_winget_ollama
winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
call :find_ollama
if errorlevel 1 goto :ollama_restart

rem --- 3. Ollama: running? -------------------------------------------------
:ollama_running
call :ollama_ping
if not errorlevel 1 goto :ollama_ok
echo       Starting Ollama...
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe" (
  start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
) else (
  start "Ollama" /min ollama serve
)
for /l %%i in (1,1,30) do (
  call :ollama_ping
  if not errorlevel 1 goto :ollama_ok
  ping -n 2 127.0.0.1 >nul
)
echo [!]   Ollama did not start. Start "Ollama" from the Start menu - the app will show setup help.
echo.
goto :install

:ollama_ok
echo       OK
echo.

rem --- 4. The AI model -----------------------------------------------------------
echo [3/5] Checking the AI model...
ollama list 2>nul | findstr /i /c:"qwen2.5-coder:1.5b" >nul
if not errorlevel 1 goto :model_ok
echo       Downloading the AI model qwen2.5-coder:1.5b - about 1 GB, first time only...
ollama pull qwen2.5-coder:1.5b
if errorlevel 1 (
  echo [!]   The model download did not finish. The app will try again when it opens.
)
:model_ok
echo       OK
echo.

rem --- 5. Components - first run only ------------------------------------
:install
echo [4/5] Checking app components...
if exist "node_modules\" goto :electron
echo       Installing components - first run only, this can take a few minutes...
call npm install
if errorlevel 1 goto :failed_install

:electron
rem Some npm versions skip Electron's own download step - make sure it's there.
if exist "node_modules\electron\dist\electron.exe" goto :start_app
echo       Downloading Electron - first run only...
call node node_modules\electron\install.js
if errorlevel 1 goto :failed_install

:start_app
echo       OK
echo.
echo [5/5] Building and starting TC SOA Studio...
echo       Keep this window open while you use the app.
call npm start
if errorlevel 1 goto :failed_start
goto :eof

rem =============================================================================
rem helpers
rem =============================================================================

:find_node
rem Node.js on PATH, or in its default folder (a fresh install isn't on PATH yet).
where node >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  exit /b 0
)
exit /b 1

:node_version_ok
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)"
exit /b %errorlevel%

:find_ollama
where ollama >nul 2>nul
if not errorlevel 1 exit /b 0
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
  set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
  exit /b 0
)
exit /b 1

:ollama_ping
rem Is the local Ollama server answering? (errorlevel 0 = yes)
curl -s -o nul --max-time 2 http://127.0.0.1:11434/api/version >nul 2>nul
exit /b %errorlevel%

rem =============================================================================
rem problems
rem =============================================================================

:not_extracted
echo [X] Run start.bat from the app's folder.
echo     If you downloaded the ZIP, right-click it - Extract All... - then open the
echo     extracted folder and double-click start.bat there.
goto :stop

:low_disk
echo [X] Only %FREE_GB% GB free on drive %~d0 - about 4 GB is needed
echo     for Node.js, Ollama, the AI model and the app. Free some space and try again.
goto :stop

:no_winget_node
echo [X] Windows' installer tool - winget - is not available, so Node.js can't be
echo     installed automatically. Opening the Node.js download page: install the LTS
echo     version, then run start.bat again.
start "" "https://nodejs.org/en/download"
goto :stop

:node_restart
echo [!] Node.js was installed. Close this window and double-click start.bat again.
goto :stop

:no_winget_ollama
echo [!]   winget is not available, so Ollama can't be installed automatically.
echo       Opening the Ollama download page - install it, then run start.bat again.
echo       Continuing - the app will show setup help.
start "" "https://ollama.com/download"
echo.
goto :install

:ollama_restart
echo [!] Ollama was installed. Close this window and double-click start.bat again.
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

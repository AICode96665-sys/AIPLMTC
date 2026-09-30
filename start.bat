@echo off
setlocal EnableExtensions
title TC SOA Studio
cd /d "%~dp0"

rem ===========================================================================
rem  TC SOA Studio - portable setup and start
rem
rem  Everything goes into the "runtime" folder next to this file. Nothing is
rem  installed on the system: no admin rights, no PATH changes, no effect on any
rem  Node.js or Ollama you already have. Delete "runtime" to remove it all.
rem
rem    runtime\node\      Node.js (portable, pinned) - unpacked from bundled\ (included)
rem    runtime\ollama\    Ollama %OLLAMA_VER% (portable, pinned), own port 11435
rem    runtime\models\    the AI model
rem  Every download is checked against the official SHA-256 checksum.
rem ===========================================================================

set "NODE_VER=22.23.3"
set "NODE_SHA=2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71"
set "OLLAMA_VER=0.34.4"
set "OLLAMA_SHA=535193f38f3344e5b08f5d1c171c31ce11aa17f0124ff69ae26d8ec7fe06fa62"
set "AI_MODEL=qwen2.5-coder:1.5b"

set "RT=%~dp0runtime"
set "NODE_DIR=%RT%\node"
set "OLLAMA_DIR=%RT%\ollama"

rem Our own Ollama: separate port and model folder, so a system Ollama is never touched.
set "OLLAMA_HOST=127.0.0.1:11435"
set "OLLAMA_MODELS=%RT%\models"
set "TC_OLLAMA_URL=http://127.0.0.1:11435"
set "TC_OLLAMA_EXE=%OLLAMA_DIR%\ollama.exe"
rem Keep npm's and Electron's download caches inside runtime as well.
set "npm_config_cache=%RT%\npm-cache"
set "electron_config_cache=%RT%\electron-cache"
set "npm_config_update_notifier=false"
set "npm_config_fund=false"
set "OUR_OLLAMA_PID="

echo ==========================================================
echo   TC SOA Studio - setup and start
echo   Everything is kept in the "runtime" folder - nothing is
echo   installed on your system.
echo ==========================================================
echo.

rem --- 0. Sanity checks ----------------------------------------------------
if not exist "package.json" goto :not_extracted
where curl >nul 2>nul
if errorlevel 1 goto :old_windows
where tar >nul 2>nul
if errorlevel 1 goto :old_windows
if not exist "%RT%" mkdir "%RT%"

set "FREE_GB="
for /f "usebackq" %%g in (`powershell -NoProfile -Command "[math]::Floor((Get-PSDrive -Name ('%~d0'.TrimEnd(':'))).Free/1GB)" 2^>nul`) do set "FREE_GB=%%g"
if not exist "%OLLAMA_DIR%\ollama.exe" if defined FREE_GB if %FREE_GB% LSS 6 goto :low_disk

rem --- 1. Node.js - portable ------------------------------------------------
echo [1/5] Node.js %NODE_VER%...
if exist "%NODE_DIR%\node.exe" goto :node_ready
rem Node.js ships with the app (bundled\ - the official zip); download it only if that is missing.
set "NODE_ZIP=%~dp0bundled\node-v%NODE_VER%-win-x64.zip"
if exist "%NODE_ZIP%" (
  call :check_sha "%NODE_ZIP%" %NODE_SHA%
  if errorlevel 1 goto :bundle_damaged
  goto :node_unpack
)
echo       Downloading portable Node.js - about 35 MB, first time only...
set "NODE_ZIP=%RT%\node.zip"
call :download "https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip" "%NODE_ZIP%" %NODE_SHA%
if errorlevel 1 goto :download_failed
:node_unpack
echo       Unpacking the included Node.js...
if exist "%RT%\node-v%NODE_VER%-win-x64" rmdir /s /q "%RT%\node-v%NODE_VER%-win-x64"
tar -xf "%NODE_ZIP%" -C "%RT%"
if errorlevel 1 goto :unpack_failed
if exist "%NODE_DIR%" rmdir /s /q "%NODE_DIR%"
ren "%RT%\node-v%NODE_VER%-win-x64" node
if errorlevel 1 goto :unpack_failed
if exist "%RT%\node.zip" del "%RT%\node.zip"
:node_ready
rem Use OUR Node.js for everything in this window, ahead of any system one.
set "PATH=%NODE_DIR%;%PATH%"
echo       OK - using %NODE_DIR%
echo.

rem --- 2. Ollama - portable ------------------------------------------------
echo [2/5] Ollama %OLLAMA_VER% - runs the AI on this PC...
if exist "%OLLAMA_DIR%\ollama.exe" goto :ollama_ready
echo       Downloading portable Ollama - about 1.4 GB, first time only...
call :download "https://github.com/ollama/ollama/releases/download/v%OLLAMA_VER%/ollama-windows-amd64.zip" "%RT%\ollama.zip" %OLLAMA_SHA%
if errorlevel 1 goto :download_failed
echo       Unpacking - this takes a minute...
if not exist "%OLLAMA_DIR%" mkdir "%OLLAMA_DIR%"
tar -xf "%RT%\ollama.zip" -C "%OLLAMA_DIR%"
if errorlevel 1 goto :unpack_failed
if not exist "%OLLAMA_DIR%\ollama.exe" goto :unpack_failed
del "%RT%\ollama.zip"
:ollama_ready
call :ollama_ping
if not errorlevel 1 goto :ollama_ok
echo       Starting our Ollama on port 11435...
for /f "usebackq" %%p in (`powershell -NoProfile -Command "(Start-Process -FilePath '%TC_OLLAMA_EXE%' -ArgumentList 'serve' -WindowStyle Hidden -PassThru).Id"`) do set "OUR_OLLAMA_PID=%%p"
for /l %%i in (1,1,30) do (
  call :ollama_ping
  if not errorlevel 1 goto :ollama_ok
  ping -n 2 127.0.0.1 >nul
)
echo [X]   Our Ollama did not start.
goto :stop
:ollama_ok
echo       OK - using %OLLAMA_DIR%
echo.

rem --- 3. The AI model --------------------------------------------------------
echo [3/5] AI model %AI_MODEL%...
"%TC_OLLAMA_EXE%" list 2>nul | findstr /i /c:"%AI_MODEL%" >nul
if not errorlevel 1 goto :model_ok
echo       Downloading the AI model - about 1 GB, first time only...
"%TC_OLLAMA_EXE%" pull %AI_MODEL%
if errorlevel 1 (
  echo [!]   The model download did not finish. The app will try again when it opens.
)
:model_ok
echo       OK - stored in %OLLAMA_MODELS%
echo.

rem --- 4. App components - first run only ---------------------------------
echo [4/5] App components...
if exist "node_modules\" goto :electron
echo       Installing components - first run only, a few minutes...
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

rem --- 5. Start ----------------------------------------------------------------
echo [5/5] Building and starting TC SOA Studio...
echo       Keep this window open while you use the app.
call npm start
set "APP_EXIT=%errorlevel%"
call :stop_our_ollama
if not "%APP_EXIT%"=="0" goto :failed_start
goto :eof

rem =============================================================================
rem helpers
rem =============================================================================

:download
rem  %1 url   %2 target file   %3 expected SHA-256
rem  Resumes an interrupted download; rejects the file if the checksum differs.
curl -L --fail --retry 3 -C - -o "%~2.part" "%~1"
if errorlevel 1 exit /b 1
call :check_sha "%~2.part" %~3
if errorlevel 1 (
  echo [X]   Checksum mismatch for %~nx2 - the download is damaged or was altered.
  del "%~2.part" >nul 2>nul
  exit /b 2
)
move /y "%~2.part" "%~2" >nul
exit /b 0

:check_sha
rem  %1 file   %2 expected SHA-256   - errorlevel 0 = matches
set "GOT_SHA="
for /f "usebackq" %%h in (`powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '%~1').Hash"`) do set "GOT_SHA=%%h"
if /i "%GOT_SHA%"=="%~2" exit /b 0
exit /b 1

:ollama_ping
rem Is our Ollama answering on port 11435? - errorlevel 0 = yes
curl -s -o nul --max-time 2 %TC_OLLAMA_URL%/api/version >nul 2>nul
exit /b %errorlevel%

:stop_our_ollama
rem Stop the Ollama this script started, so it doesn't keep using memory.
if defined OUR_OLLAMA_PID taskkill /PID %OUR_OLLAMA_PID% /T /F >nul 2>nul
exit /b 0

rem =============================================================================
rem problems
rem =============================================================================

:not_extracted
echo [X] Run start.bat from the app's folder.
echo     If you downloaded the ZIP, right-click it - Extract All... - then open the
echo     extracted folder and double-click start.bat there.
goto :stop

:old_windows
echo [X] This Windows version is missing curl or tar, which start.bat needs to download
echo     and unpack Node.js and Ollama. Windows 10 - version 1803 or newer - and Windows 11
echo     include both. Please update Windows, or use the installer from the Releases page.
goto :stop

:low_disk
echo [X] Only %FREE_GB% GB free on drive %~d0 - about 6 GB is needed for the first run:
echo     Node.js, Ollama, the AI model and the app. Free some space and try again.
goto :stop

:download_failed
echo [X] A download failed. Check your internet connection and run start.bat again -
echo     it continues where it stopped.
goto :stop

:bundle_damaged
echo [X] The included Node.js - bundled\node-v%NODE_VER%-win-x64.zip - is damaged or was
echo     changed. Get the app again - git clone or Download ZIP - and run start.bat again.
goto :stop

:unpack_failed
echo [X] Unpacking failed. Delete the "runtime" folder and run start.bat again.
goto :stop

:failed_install
echo [X] Installing components failed. Check your internet connection and try again.
goto :stop

:failed_start
echo [X] The app could not start. See the messages above.
goto :stop

:stop
call :stop_our_ollama
echo.
pause
exit /b 1

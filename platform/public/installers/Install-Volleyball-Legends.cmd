@echo off
setlocal EnableExtensions
title PlayBound - Install Volleyball Legends

set "ROBLOX_INSTALLER_URL=https://setup.rbxcdn.com/RobloxPlayerInstaller.exe"
set "ROBLOX_GAME_URL=roblox://placeId=73956553001240"
set "ROBLOX_WEB_URL=https://www.roblox.com/games/73956553001240/Volleyball-Legends"
set "INSTALLER_PATH=%TEMP%\PlayBound-RobloxPlayerInstaller.exe"
set "PLAYBOUND_GAME_DIR=%LOCALAPPDATA%\PlayBound\Games\volleyball-legends"
set "PLAYBOUND_LAUNCHER=%LOCALAPPDATA%\PlayBound\Games\volleyball-legends\Play-Volleyball-Legends.cmd"

echo.
echo  PlayBound - Volleyball Legends
echo  --------------------------------
echo.

rem Roblox registers the roblox-player protocol for the desktop client.
reg query "HKCU\Software\Classes\roblox-player" >nul 2>&1
if not errorlevel 1 goto launch_game

reg query "HKLM\Software\Classes\roblox-player" >nul 2>&1
if not errorlevel 1 goto launch_game

echo Roblox is not installed. Downloading the official Roblox Player...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "Invoke-WebRequest -UseBasicParsing -Uri '%ROBLOX_INSTALLER_URL%' -OutFile '%INSTALLER_PATH%';" ^
  "$signature=Get-AuthenticodeSignature -LiteralPath '%INSTALLER_PATH%';" ^
  "if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Roblox'){Remove-Item -LiteralPath '%INSTALLER_PATH%' -Force -ErrorAction SilentlyContinue; throw 'The downloaded installer was not validly signed by Roblox.'}"

if errorlevel 1 goto install_failed

echo Installing Roblox Player...
start "" /wait "%INSTALLER_PATH%"
set "INSTALL_EXIT=%ERRORLEVEL%"
del /q "%INSTALLER_PATH%" >nul 2>&1
if not "%INSTALL_EXIT%"=="0" goto install_failed

:launch_game
if not exist "%PLAYBOUND_GAME_DIR%" mkdir "%PLAYBOUND_GAME_DIR%"
>"%PLAYBOUND_LAUNCHER%" echo @echo off
>>"%PLAYBOUND_LAUNCHER%" echo start "" "%ROBLOX_GAME_URL%"
echo Launching Volleyball Legends...
start "" "%ROBLOX_GAME_URL%"
if errorlevel 1 goto launch_fallback
exit /b 0

:launch_fallback
echo Roblox could not be opened directly. Opening the official game page...
start "" "%ROBLOX_WEB_URL%"
exit /b 0

:install_failed
echo.
echo Roblox Player could not be installed automatically.
echo Opening the official Volleyball Legends page instead...
start "" "%ROBLOX_WEB_URL%"
echo.
pause
exit /b 1

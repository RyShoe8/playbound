; PlayBound NSIS hooks — install bundled network/controller prerequisites with
; PlayBound Setup. Runtime checks repair a missing component later if needed.

!macro customInstall
  ; Show the names and purpose of bundled components during installation.
  SetDetailsView show
  DetailPrint "PlayBound setup includes ViGEmBus controller support and NetBird Virtual LAN networking."
  ; Refresh existing shortcuts even when electron-builder keeps them on update.
  ; A versioned icon path prevents Explorer from reusing the previous brand mark.
  IfFileExists "$INSTDIR\resources\icons\playbound-${VERSION}.ico" 0 brand_icon_done
    IfFileExists "$newStartMenuLink" 0 brand_desktop_icon
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\icons\playbound-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
      System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$newStartMenuLink", p 0)'
    brand_desktop_icon:
    IfFileExists "$newDesktopLink" 0 brand_icon_refresh
      CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icons\playbound-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$newDesktopLink", p 0)'
    brand_icon_refresh:
      System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
    brand_icon_done:

  ; Automatic launcher updates run silently. Do not block them with a modal or
  ; install prerequisites without an interactive explanation. The launcher
  ; checks for missing components when a player uses the related feature.
  IfSilent prereq_silent 0
  MessageBox MB_YESNO|MB_ICONINFORMATION "PlayBound Setup includes two established, open-source components from their official releases:$\r$\n$\r$\nViGEmBus lets phone and remote controllers work as gamepads.$\r$\nNetBird connects party PCs over a private Virtual LAN.$\r$\n$\r$\nInstall these components now? Windows may ask for administrator approval. Choose No to install PlayBound without them; PlayBound can set them up later when needed." IDYES prereq_install
  DetailPrint "Optional controller and Virtual LAN components skipped. PlayBound will check when needed."
  Goto prereq_done
  prereq_install:

  ; ViGEmBus makes PlayBound's phone and remote controllers appear as gamepads.
  ; Keep installing it with Setup; ensureVigem rechecks it when used later.
  IfFileExists "$INSTDIR\resources\vigem\ViGEmBus_Setup.exe" 0 vigem_skip
    DetailPrint "Installing ViGEmBus — controller support for games and remote players…"
    ExecWait '"$INSTDIR\resources\vigem\ViGEmBus_Setup.exe" /quiet' $0
    StrCmp $0 "0" vigem_ready
    DetailPrint "ViGEmBus could not be installed (Windows code $0). PlayBound will offer repair when controller support is needed."
    Goto vigem_done
  vigem_ready:
    DetailPrint "ViGEmBus controller support is ready."
    Goto vigem_done
  vigem_skip:
    DetailPrint "ViGEmBus installer is not bundled; PlayBound will check again when controller support is used."
  vigem_done:

  ; Avoid rerunning NetBird's MSI on every PlayBound update: its maintenance
  ; path can fail on an existing installation. The launcher checks again when
  ; Virtual LAN is used and can repair a missing installation in-app.
  IfFileExists "$PROGRAMFILES64\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$PROGRAMFILES\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$LOCALAPPDATA\Programs\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$INSTDIR\resources\netbird\netbird_installer.msi" 0 netbird_skip
    DetailPrint "Installing NetBird — private Virtual LAN for multiplayer parties…"
    ExecWait 'msiexec /i "$INSTDIR\resources\netbird\netbird_installer.msi" /quiet /norestart' $1
    StrCmp $1 "0" netbird_ready
    DetailPrint "NetBird could not be installed (Windows code $1). PlayBound will offer repair when Virtual LAN is needed."
    Goto netbird_cleanup
  netbird_ready:
    DetailPrint "NetBird Virtual LAN networking is ready."
  netbird_cleanup:
    SetShellVarContext all
    Delete "$DESKTOP\NetBird.lnk"
    Delete "$DESKTOP\NetBird*.lnk"
    SetShellVarContext current
    Delete "$DESKTOP\NetBird.lnk"
    Delete "$DESKTOP\NetBird*.lnk"
    Goto netbird_done
  netbird_already_installed:
    DetailPrint "NetBird is already installed; keeping the existing network client."
    Goto netbird_done
  netbird_skip:
    DetailPrint "NetBird installer is not bundled; PlayBound will check again when Virtual LAN is used."
  netbird_done:
    Goto prereq_done

  prereq_silent:
    DetailPrint "Silent launcher update: keeping installed prerequisites; PlayBound will check when needed."
  prereq_done:

!macroend

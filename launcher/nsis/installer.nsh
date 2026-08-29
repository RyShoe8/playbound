; PlayBound NSIS hooks — best-effort ViGEmBus + NetBird install with PlayBound Setup.
; Couch Mode also auto-installs ViGEmBus on first Start if this step was skipped
; (portable builds, UAC declined, etc.).
; NetBird auto-installs at runtime on first party join if skipped here.

!macro customInstall
  ; Bundled under $INSTDIR\resources\vigem\ by electron-builder extraResources.
  IfFileExists "$INSTDIR\resources\vigem\ViGEmBus_Setup.exe" 0 vigem_skip
    DetailPrint "Enabling PlayBound controllers…"
    ; /quiet needs elevation; NSIS already elevates when the OS requires it.
    ExecWait '"$INSTDIR\resources\vigem\ViGEmBus_Setup.exe" /quiet' $0
    DetailPrint "ViGEmBus setup exit code $0"
    Goto vigem_done
  vigem_skip:
    DetailPrint "ViGEmBus setup not bundled; Couch Mode will install on first use."
  vigem_done:

  ; Bundled under $INSTDIR\resources\netbird\ by electron-builder extraResources.
  ;
  ; Do not run the MSI again during a PlayBound update when NetBird is already
  ; installed.  NetBird's MSI maintenance path is not idempotent across every
  ; bundled version and can abort an otherwise healthy PlayBound update with
  ; errors such as "EnableDiscoveryNat is not defined".  The launcher runtime
  ; already installs NetBird on demand when no CLI is present, so an existing
  ; installation is both sufficient and the safest signal to skip setup here.
  IfFileExists "$PROGRAMFILES64\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$PROGRAMFILES\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$LOCALAPPDATA\Programs\NetBird\netbird.exe" netbird_already_installed 0
  IfFileExists "$INSTDIR\resources\netbird\netbird_installer.msi" 0 netbird_skip
    DetailPrint "Setting up PlayBound networking…"
    ExecWait 'msiexec /i "$INSTDIR\resources\netbird\netbird_installer.msi" /quiet' $1
    DetailPrint "NetBird setup exit code $1"

    ; Clean up NetBird desktop shortcuts so only PlayBound is on the user's desktop
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
    DetailPrint "NetBird setup not bundled; will install on first party join."
  netbird_done:
!macroend

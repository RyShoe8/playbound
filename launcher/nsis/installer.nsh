; PlayBound NSIS hooks — best-effort ViGEmBus install with PlayBound Setup.
; Couch Mode also auto-installs on first Start if this step was skipped
; (portable builds, UAC declined, etc.).

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
!macroend

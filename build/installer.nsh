; Extra uninstall cleanup for the NSIS installer (picked up by electron-builder via nsis.include).
!macro customUnInstall
  ; Droper creates its Explorer "Send to" shortcut itself, so the uninstaller doesn't know about it.
  ; Skip during updates: the old version is uninstalled first and the new one recreates the link anyway.
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\Microsoft\Windows\SendTo\Droper.lnk"
  ${endIf}
!macroend

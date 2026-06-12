!macro NSIS_HOOK_PREUNINSTALL
  ; Terminate any running instances of the app or spawned Java processes
  nsExec::ExecToLog 'taskkill /F /IM "Yomikura.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "java.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "javaw.exe"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove app data folders (Local and Roaming)
  RMDir /r "$LOCALAPPDATA\app.yomikura"
  RMDir /r "$APPDATA\app.yomikura"
!macroend

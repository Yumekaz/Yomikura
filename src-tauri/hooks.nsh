!macro NSIS_HOOK_PREUNINSTALL
  ; Terminate any running instances of the app or spawned Java processes
  nsExec::ExecToLog 'taskkill /F /IM "Yomikura.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "java.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "javaw.exe"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Only remove application-owned folders. A user-selected storage folder may
  ; contain unrelated files, so it must never be recursively removed here.
  RMDir /r "$LOCALAPPDATA\app.yomikura"
  RMDir /r "$APPDATA\app.yomikura"
!macroend

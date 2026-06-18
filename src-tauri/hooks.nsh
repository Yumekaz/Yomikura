!macro NSIS_HOOK_PREUNINSTALL
  ; Terminate any running instances of the app or spawned Java processes
  nsExec::ExecToLog 'taskkill /F /IM "Yomikura.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "java.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "javaw.exe"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Read custom storage path if it exists
  ClearErrors
  FileOpen $0 "$APPDATA\app.yomikura\custom_path.txt" r
  IfErrors no_custom_path
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "" no_custom_path
  DetailPrint "Removing custom storage folder: $1"
  RMDir /r "$1"
no_custom_path:

  ; Remove app data folders (Local and Roaming)
  RMDir /r "$LOCALAPPDATA\app.yomikura"
  RMDir /r "$APPDATA\app.yomikura"
!macroend

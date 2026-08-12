!macro NSIS_HOOK_PREUNINSTALL
  ; Terminate the app and only the Yomikura-owned Suwayomi process.
  nsExec::ExecToLog 'taskkill /F /IM "Yomikura.exe"'
  IfFileExists "$LOCALAPPDATA\app.yomikura\backend.pid" 0 yomikura_backend_done
  FileOpen $0 "$LOCALAPPDATA\app.yomikura\backend.pid" r
  ClearErrors
  FileRead $0 $YomikuraBackendPid
  FileClose $0
  IfErrors yomikura_backend_done
  nsExec::ExecToLog 'taskkill /F /PID "$YomikuraBackendPid"'
  Delete "$LOCALAPPDATA\app.yomikura\backend.pid"
yomikura_backend_done:
  ; The generated uninstaller sets this state on the confirmation page. Read
  ; and remove custom storage before Tauri removes the record under AppData.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    !insertmacro YOMIKURA_DELETE_RECORDED_STORAGE "$APPDATA\app.yomikura\managed-storage-path.txt" appdata
    !insertmacro YOMIKURA_DELETE_RECORDED_STORAGE "$LOCALAPPDATA\app.yomikura\managed-storage-path.txt" localdata
  ${EndIf}
!macroend

Var YomikuraStoragePath
Var YomikuraStorageMarker
Var YomikuraStorageRoot
Var YomikuraBackendPid

!macro YOMIKURA_DELETE_RECORDED_STORAGE RECORD_PATH LABEL_PREFIX
  IfFileExists "${RECORD_PATH}" 0 ${LABEL_PREFIX}_done
  FileOpen $0 "${RECORD_PATH}" r

${LABEL_PREFIX}_read:
  ClearErrors
  FileRead $0 $YomikuraStoragePath
  IfErrors ${LABEL_PREFIX}_close
  StrCmp $YomikuraStoragePath "" ${LABEL_PREFIX}_read
  IfFileExists "$YomikuraStoragePath\.yomikura-managed-storage" 0 ${LABEL_PREFIX}_read
  FileOpen $1 "$YomikuraStoragePath\.yomikura-managed-storage" r
  ClearErrors
  FileRead $1 $YomikuraStorageMarker
  FileClose $1
  IfErrors ${LABEL_PREFIX}_read
  StrCmp $YomikuraStorageMarker "YOMIKURA_MANAGED_STORAGE_V1" 0 ${LABEL_PREFIX}_read

  ; Never recursively remove a root, app-data directory, or install folder,
  ; even if a malformed record or marker is present there.
  ${GetRoot} "$YomikuraStoragePath" $YomikuraStorageRoot
  StrCmp "$YomikuraStoragePath" "$YomikuraStorageRoot" ${LABEL_PREFIX}_read
  StrCmp "$YomikuraStoragePath" "$INSTDIR" ${LABEL_PREFIX}_read
  StrCmp "$YomikuraStoragePath" "$APPDATA" ${LABEL_PREFIX}_read
  StrCmp "$YomikuraStoragePath" "$LOCALAPPDATA" ${LABEL_PREFIX}_read
  StrCmp "$YomikuraStoragePath" "$TEMP" ${LABEL_PREFIX}_read
  RMDir /r "$YomikuraStoragePath"
  Goto ${LABEL_PREFIX}_read

${LABEL_PREFIX}_close:
  FileClose $0
${LABEL_PREFIX}_done:
!macroend

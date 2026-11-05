export type UpdatePhase = "checking" | "installing" | "restarting";
export function updateFailure(error: unknown, phase: UpdatePhase) {
  const details = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
  if (phase === "restarting") return { message: "The update was installed, but Yomikura could not reopen automatically. Close the app and open it from your usual shortcut.", details };
  if (phase === "checking") return { message: "Updates could not be checked. Check your internet connection, then try again. You can also view releases on the official download page.", details };
  if (/signature|checksum|verification|verify|hash mismatch/i.test(details)) return { message: "The update could not be verified. Try downloading it again. If this repeats, use the official release page and report the verification error; do not install an unverified file.", details };
  if (/disk.*full|no space|not enough.*space|os error 112/i.test(details)) return { message: "There is not enough space to install the update. Free some disk space and try again. Keep your library folder.", details };
  if (/permission|access.*denied|os error 5/i.test(details)) return { message: "Windows prevented the update from being installed. Close other Yomikura windows and try again, or use the official installer. Keep your existing library folder.", details };
  return { message: "The update could not be downloaded or installed. Check your connection and free disk space, then try again. The official release page also provides a manual installer.", details };
}

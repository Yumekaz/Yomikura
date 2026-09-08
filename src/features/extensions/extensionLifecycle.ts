type ExtensionSnapshot = {
  pkgName: string;
  isInstalled: boolean;
  hasUpdate: boolean;
  versionName: string;
};

type ExtensionSdk = {
  GetExtensions(): Promise<{ extensions?: { nodes?: Array<ExtensionSnapshot | null> } }>;
  ToggleExtensionInstall(input: {
    input: { id: string; patch: { install?: boolean; uninstall?: boolean; update?: boolean } };
  }): Promise<unknown>;
};

export type VerifiedExtensionResult = {
  extension: ExtensionSnapshot | null;
  recovered: boolean;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function actionCompleted(action: "install" | "uninstall" | "update", extension: ExtensionSnapshot | null) {
  if (action === "uninstall") return !extension?.isInstalled;
  if (action === "install") return extension?.isInstalled === true;
  return extension?.isInstalled === true && extension.hasUpdate === false;
}

async function readExtension(sdk: ExtensionSdk, pkgName: string) {
  const result = await sdk.GetExtensions();
  return result.extensions?.nodes?.find((extension) => extension?.pkgName === pkgName) ?? null;
}

async function pollForState(
  sdk: ExtensionSdk,
  pkgName: string,
  action: "install" | "uninstall" | "update",
  attempts = 6,
  pause = wait,
) {
  let extension: ExtensionSnapshot | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    extension = await readExtension(sdk, pkgName);
    if (actionCompleted(action, extension)) return extension;
    if (attempt < attempts - 1) await pause(650 * (attempt + 1));
  }
  return extension;
}

export async function performVerifiedExtensionAction(
  sdk: ExtensionSdk,
  pkgName: string,
  action: "install" | "uninstall" | "update",
  options?: { pause?: (milliseconds: number) => Promise<unknown> },
): Promise<VerifiedExtensionResult> {
  const pause = options?.pause ?? wait;
  await sdk.ToggleExtensionInstall({
    input: {
      id: pkgName,
      patch: action === "install" ? { install: true } : action === "uninstall" ? { uninstall: true } : { update: true },
    },
  });

  let extension = await pollForState(sdk, pkgName, action, 6, pause);
  if (actionCompleted(action, extension)) return { extension, recovered: false };

  // Suwayomi versions before the extension-update transaction fix could remove
  // the installed copy when an update failed. Attempt one reinstall so the
  // source is not silently left unavailable, then report the recovery clearly.
  if (action === "update" && extension && !extension.isInstalled) {
    await sdk.ToggleExtensionInstall({ input: { id: pkgName, patch: { install: true } } });
    extension = await pollForState(sdk, pkgName, "install", 6, pause);
    if (extension?.isInstalled) return { extension, recovered: true };
  }

  throw new Error(
    action === "update"
      ? "Suwayomi did not confirm the extension update. The existing installation may need recovery; refresh the catalogue and retry the individual extension."
      : `Suwayomi did not confirm the extension ${action}. Refresh the catalogue and retry.`,
  );
}

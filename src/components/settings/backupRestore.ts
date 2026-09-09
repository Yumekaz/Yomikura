export type RestoreStatus = { state: string; mangaProgress: number; totalManga: number };

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForRestoreStatus(
  getStatus: (id: string) => Promise<{ restoreStatus?: RestoreStatus | null }>,
  id: string,
  options: { attempts?: number; pause?: (milliseconds: number) => Promise<unknown> } = {},
) {
  const attempts = options.attempts ?? 40;
  const pause = options.pause ?? wait;
  let lastStatus: RestoreStatus | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await getStatus(id);
    lastStatus = result.restoreStatus ?? null;
    if (lastStatus?.state === "SUCCESS") return { completed: true, status: lastStatus };
    if (lastStatus?.state === "FAILURE") throw new Error("Suwayomi reported that the restore failed. Your safety backup is still available in the server backup folder.");
    if (attempt < attempts - 1) await pause(750);
  }
  return { completed: false, status: lastStatus };
}

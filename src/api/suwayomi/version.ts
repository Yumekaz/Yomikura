export function parseSuwayomiVersion(value: string | null | undefined) {
  const match = value?.match(/(?:^|v)(\d+)\.(\d+)\.(\d+)/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as const : null;
}

export function compareSuwayomiVersions(left: string | null | undefined, right: string | null | undefined) {
  const a = parseSuwayomiVersion(left);
  const b = parseSuwayomiVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

const formats = /\.(cbz|zip|cbr|rar|epub)$/i;
export function validateImportSelection(files: { name: string; size: number }[]) {
  if (!files.length) throw new Error("Choose at least one archive.");
  const names = new Set<string>(); let size = 0;
  for (const file of files) {
    if (!formats.test(file.name)) throw new Error(`${file.name}: supported archives are CBZ/ZIP, CBR/RAR and EPUB. PDF is not supported.`);
    if (names.has(file.name.toLowerCase())) throw new Error("Choose unique archive names; letter case does not make a separate destination.");
    names.add(file.name.toLowerCase()); size += file.size;
    if (!file.size || file.size > 128 * 1024 * 1024 || size > 256 * 1024 * 1024) throw new Error("Choose nonempty archives up to 128 MiB each and 256 MiB per batch. Larger archives can be copied on the server.");
  }
}

const baseUrlArgument = process.argv.find((argument) => argument.startsWith("--base-url="));
const baseUrl = (baseUrlArgument?.slice("--base-url=".length) || "http://127.0.0.1:4567").replace(/\/+$/, "");

const expectedQueryFields = [
  "categories",
  "mangas",
  "manga",
  "chapter",
  "extensions",
  "extensionStores",
  "downloadStatus",
  "restoreStatus",
  "settings",
];

const expectedMutationFields = [
  "addExtensionStore",
  "removeExtensionStore",
  "fetchExtensions",
  "updateExtension",
  "updateExtensions",
  "fetchChapterPages",
  "startDownloader",
  "stopDownloader",
  "clearDownloader",
  "dequeueChapterDownload",
  "createBackup",
  "restoreBackup",
];

async function introspectFields(typeName) {
  // Suwayomi intentionally rejects broad introspection requests. Keep the
  // check narrow so release validation follows the same policy as clients.
  const response = await fetch(`${baseUrl}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `query VerifyYomikuraContract { type: __type(name: "${typeName}") { fields { name } } }` }),
  });
  if (!response.ok) throw new Error(`Suwayomi contract request returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`Suwayomi ${typeName} contract introspection failed: ${payload.errors.map((error) => error.message).join("; ")}`);
  return new Set(payload.data?.type?.fields?.map((field) => field.name) ?? []);
}

const [availableQueries, availableMutations] = await Promise.all([
  introspectFields("Query"),
  introspectFields("Mutation"),
]);
const missingQueries = expectedQueryFields.filter((field) => !availableQueries.has(field));
const missingMutations = expectedMutationFields.filter((field) => !availableMutations.has(field));

if (missingQueries.length || missingMutations.length) {
  const details = [
    missingQueries.length ? `missing Query fields: ${missingQueries.join(", ")}` : "",
    missingMutations.length ? `missing Mutation fields: ${missingMutations.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  throw new Error(`Suwayomi is incompatible with Yomikura's supported API contract (${details}).`);
}

console.log(`Suwayomi API contract passed at ${baseUrl}: ${expectedQueryFields.length} query fields and ${expectedMutationFields.length} mutation fields available.`);

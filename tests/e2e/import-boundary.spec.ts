import { expect, test } from "@playwright/test";
import { mockSdk } from "../../src/api/graphql/mockSdk";
for (const path of ["/srv/remote-library/local", ""]) test(`web import gives server-side instructions without filesystem writes (${path || "missing path"})`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: "http://127.0.0.1:45679", mockMode: false, connectionStatus: "connected" } })));
  await page.route("**/api/graphql", async (route) => {
    const { query, operationName, variables = {} } = route.request().postDataJSON(); const name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    const method = (mockSdk as unknown as Record<string, (input: unknown) => Promise<unknown>>)[name!];
    const data = name === "GetServerSettings" ? { settings: { localSourcePath: path } } : method ? await method(variables) : { __typename: "Query" };
    await route.fulfill({ json: { data } });
  });
  await page.goto("/settings/advanced");
  const importer = page.locator('section[aria-labelledby="local-import-heading"]');
  await expect(importer).toContainText("The web app cannot write to a server's filesystem.");
  await expect(importer).toContainText("PDF is not supported");
  await expect(importer.locator('input[type="file"]')).toHaveCount(0);
  await expect(importer.getByRole("button", { name: "Import to Local source", exact: true })).toHaveCount(0);
  if (path) await expect(importer).toContainText(path); else await expect(importer).toContainText("No directory could be confirmed");
});

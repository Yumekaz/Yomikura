import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { mockSdk } from "../../src/api/graphql/mockSdk";
const backend = "http://127.0.0.1:45679";
test.beforeEach(async ({ page }) => {
  await page.addInitScript((backend) => { if (!localStorage.getItem("yomikura-settings")) localStorage.setItem("yomikura-settings", JSON.stringify({ version: 0, state: { serverBaseUrl: backend, mockMode: false, connectionStatus: "connected" } })); }, backend);
  await page.route(`${backend}/api/graphql`, async (route) => {
    const { query, operationName, variables = {} } = route.request().postDataJSON(), name = operationName || /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    if (name === "CreateBackup") return route.fulfill({ json: { data: { createBackup: { url: "/export/notes-fixture.tachibk" } } } });
    const method = (mockSdk as unknown as Record<string, (args: unknown) => Promise<unknown>>)[name];
    await route.fulfill({ json: { data: method ? await method(variables) : { __typename: "Query" } } });
  });
  await page.route(`${backend}/export/notes-fixture.tachibk`, (route) => route.fulfill({ contentType: "application/gzip", body: gzipSync("Original backup fixture") }));
});
async function readDownload(download: Promise<import("@playwright/test").Download>) {
  const path = await (await download).path(); expect(path).not.toBeNull(); return JSON.parse(await readFile(path!, "utf8"));
}
test("device note export and verified backup snapshots preserve earlier drafts", async ({ page }) => {
  await page.goto("/manga/10001"); await page.getByText("My notes", { exact: false }).click();
  await page.getByRole("textbox", { name: "A note for [Demo] The Paper Garden", exact: true }).fill("A thought before backup.");
  await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible();
  await page.goto("/settings/backup");
  const file = page.waitForEvent("download"); await page.getByRole("button", { name: "Export device notes", exact: true }).click();
  expect((await readDownload(file)).notes).toEqual([{ mangaId: 10001, title: "[Demo] The Paper Garden", value: "A thought before backup." }]);
  const archive = page.waitForEvent("download"); await page.getByRole("button", { name: "Create & Download Backup", exact: true }).click(); await archive;
  await expect(page.getByRole("button", { name: "Export saved notes", exact: true })).toBeVisible();
  await page.goto("/manga/10001"); await page.getByText("My notes", { exact: false }).click();
  await page.getByRole("textbox", { name: "A note for [Demo] The Paper Garden", exact: true }).fill("A thought after backup.");
  await expect(page.getByRole("status").filter({ hasText: "Saved on this device" })).toBeVisible(); await page.goto("/settings/backup");
  const snapshot = page.waitForEvent("download"); await page.getByRole("button", { name: "Export saved notes", exact: true }).click();
  expect((await readDownload(snapshot)).notes[0].value).toBe("A thought before backup.");
});
test("note import validates book identity and leaves current device edits untouched", async ({ page }) => {
  await page.goto("/settings/backup");
  const importFile = async (value: string) => {
    const notes = { format: "yomikura-notes", version: 1, notes: [{ mangaId: 10001, title: "[Demo] The Paper Garden", value }, { mangaId: 10002, title: "Different title", value: "Do not attach me" }] };
    await page.getByLabel("Import device notes", { exact: true }).setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(notes)) });
    await page.getByRole("alertdialog", { name: "Import book notes?", exact: true }).getByRole("button", { name: "Import notes", exact: true }).click();
  };
  await importFile("Imported thought."); await expect(page.getByRole("status").filter({ hasText: "1 added · 0 existing notes kept · 1 unmatched" })).toBeVisible();
  await importFile("An older thought."); await expect(page.getByRole("status").filter({ hasText: "0 added · 1 existing notes kept · 1 unmatched" })).toBeVisible();
  await page.goto("/manga/10001"); await page.getByText("My notes", { exact: false }).click();
  await expect(page.getByRole("textbox", { name: "A note for [Demo] The Paper Garden", exact: true })).toHaveValue("Imported thought.");
});

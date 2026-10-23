import { describe, expect, it, vi } from "vitest";
import { restoreBackupUpload } from "./backupUpload";

describe("Suwayomi backup upload contract", () => {
  it("places the upload in a top-level variable supported by the server parser", async () => {
    const file = new File([new Uint8Array([0x1f, 0x8b])], "fixture.tachibk");
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { restoreBackup: { id: "job" } } })));
    expect((await restoreBackupUpload("http://localhost:4567/api/graphql", file, request)).id).toBe("job");
    const body = request.mock.calls[0][1]!.body as FormData;
    const operations = JSON.parse(body.get("operations") as string);
    expect(operations.variables).toEqual({ backup: null });
    expect(operations.query).toContain("$backup: Upload!");
    expect(operations.query).toContain("input: { backup: $backup }");
    expect(JSON.parse(body.get("map") as string)).toEqual({ "0": ["variables.backup"] });
    const uploaded = body.get("0") as File;
    expect(uploaded.name).toBe(file.name);
    expect(new Uint8Array(await uploaded.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
  });

  it("requires a restore job ID and preserves a server-reported upload failure", async () => {
    const file = new File(["fixture"], "fixture.tachibk");
    await expect(restoreBackupUpload("http://localhost/api/graphql", file, async () => new Response(JSON.stringify({ data: { restoreBackup: {} } })))).rejects.toThrow("job ID");
    await expect(restoreBackupUpload("http://localhost/api/graphql", file, async () => new Response(JSON.stringify({ errors: [{ message: "Upload rejected" }] })))).rejects.toThrow("Upload rejected");
  });
});

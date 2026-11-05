import { describe, expect, it } from "vitest";
import { updateFailure } from "./updateFailure";
describe("update recovery guidance", () => {
  it("does not call an installed update a failed download when relaunch fails", () => {
    const result = updateFailure(new Error("process spawn failed"), "restarting");
    expect(result.message).toContain("was installed"); expect(result.message).toContain("shortcut");
    expect(result.details).toBe("process spawn failed");
  });
  it("does not present a failed check as a successful up-to-date result", () => {
    expect(updateFailure("fetch failed", "checking").message).toContain("could not be checked");
  });
  it("offers distinct recovery for verification, disk and permission failures", () => {
    expect(updateFailure("signature verification failed", "installing").message).toContain("do not install an unverified file");
    expect(updateFailure("not enough disk space (os error 112)", "installing").message).toContain("Keep your library folder");
    expect(updateFailure("access denied (os error 5)", "installing").message).toContain("Close other Yomikura windows");
  });
});

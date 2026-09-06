import { describe, expect, it } from "vitest";
import { validateServerBaseUrl } from "./server";

describe("validateServerBaseUrl", () => {
  it.each([
    ["http://127.0.0.1:4567/", "http://127.0.0.1:4567"],
    ["https://reader.example.com/suwayomi/", "https://reader.example.com/suwayomi"],
    ["http://192.168.1.20:4567", "http://192.168.1.20:4567"],
  ])("normalizes valid server URL %s", (input, normalizedUrl) => {
    expect(validateServerBaseUrl(input)).toEqual({ valid: true, normalizedUrl });
  });

  it.each([
    ["", "Server URL cannot be empty."],
    ["not a URL", "Enter a complete server URL, such as http://127.0.0.1:4567."],
    ["file:///C:/secrets", "Server URL must use http:// or https://."],
    ["http://user:password@127.0.0.1:4567", "Do not put a username or password in the server URL."],
    ["http://127.0.0.1:4567/?token=secret", "Server URL cannot contain a query string or fragment."],
  ])("rejects unsafe or incomplete server URL %s", (input, message) => {
    expect(validateServerBaseUrl(input)).toEqual({ valid: false, message });
  });
});

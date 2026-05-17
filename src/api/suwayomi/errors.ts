import { ClientError } from "graphql-request";

export type SourceProblem = {
  title: string;
  detail: string;
  owner: "source" | "network" | "server" | "app";
  kind: "dns" | "cloudflare" | "source-down" | "browser-runtime" | "app-network" | "unknown";
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ClientError) {
    const graphQlMessage = error.response.errors?.map((item) => item.message).join("; ");
    return graphQlMessage || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export function classifySourceProblem(error: unknown): SourceProblem {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("no such host") || lower.includes("dns") || lower.includes("unknownhost")) {
    return {
      title: "DNS or network failure",
      detail: `${message}. Your machine or Suwayomi server could not resolve the source host.`,
      owner: "network",
      kind: "dns",
    };
  }

  if (lower.includes("cloudflare") || lower.includes("captcha") || lower.includes("ddos-guard")) {
    return {
      title: "Source protection blocked the request",
      detail: `${message}. This usually has to be solved in the upstream extension/server path.`,
      owner: "source",
      kind: "cloudflare",
    };
  }

  if (lower.includes("glprofile") || lower.includes("gluegen") || lower.includes("kcef")) {
    return {
      title: "Embedded browser runtime issue",
      detail: `${message}. This source needs Suwayomi's embedded browser path, which is failing on this machine.`,
      owner: "server",
      kind: "browser-runtime",
    };
  }

  if (lower.includes("502") || lower.includes("503") || lower.includes("504")) {
    return {
      title: "Source website is failing",
      detail: `${message}. Retry later or try another source for the same manga.`,
      owner: "source",
      kind: "source-down",
    };
  }

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("cors")) {
    return {
      title: "Browser could not reach Suwayomi",
      detail: `${message}. Check the server URL, CORS, and whether Suwayomi is still running.`,
      owner: "app",
      kind: "app-network",
    };
  }

  return {
    title: "Source request failed",
    detail: message,
    owner: "server",
    kind: "unknown",
  };
}

export function getSourceRecoveryHints(problem?: SourceProblem | null): string[] {
  if (!problem) {
    return [
      "Try the same title from another installed source.",
      "If several sources fail, check whether Suwayomi is still running.",
    ];
  }

  switch (problem.kind) {
    case "dns":
      return [
        "Try another installed source for this title.",
        "If this is MangaDex, change Windows DNS to 1.1.1.1 or 8.8.8.8, flush DNS, then restart Suwayomi.",
      ];
    case "cloudflare":
      return [
        "Try another installed source first; many Cloudflare-protected sites are unstable from server clients.",
        "For this source specifically, enable a FlareSolverr or Byparr service in Suwayomi.",
      ];
    case "browser-runtime":
      return [
        "Try another source; sources that need the embedded browser can fail because of local native runtime issues.",
        "If you need this source, run Suwayomi outside sandboxed tooling and check graphics/browser-runtime dependencies.",
      ];
    case "source-down":
      return [
        "Retry once, then try another source for the same title.",
        "This usually means the source website is temporarily broken or blocking requests.",
      ];
    case "app-network":
      return [
        "Check the configured Suwayomi URL and whether the server is still running.",
        "Use http://127.0.0.1:4567 when testing locally.",
      ];
    default:
      return [
        "Retry once, then try another installed source for the same title.",
        "If many unrelated sources fail, check Suwayomi logs and extension health.",
      ];
  }
}

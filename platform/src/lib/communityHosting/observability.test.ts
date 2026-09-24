import { expect, it, vi } from "vitest";

const bugs: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/BugReport", () => ({ default: {
  findOne: async () => null,
  create: async (doc: Record<string, unknown>) => { bugs.push(doc); },
} }));

it("files a managed-server provisioning failure in the existing Bugs feed", async () => {
  bugs.length = 0;
  const { maybeUpsertAutoBugFromTelemetry } = await import("@/lib/autoBugReport");
  await maybeUpsertAutoBugFromTelemetry({
    event: "community_server_failed",
    properties: {
      source: "website", area: "hosting", gameSlug: "openra",
      code: "PROCESS_EXITED", phase: "reconcile", message: "Server exited during startup",
    },
  });
  expect(bugs).toHaveLength(1);
  expect(String(bugs[0].description)).toContain("Game: openra");
  expect(String(bugs[0].description)).toContain("PROCESS_EXITED");
});

import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  credentials: [] as Array<{ userId: string; tokenHash: string; createdAt: Date; revokedAt: Date | null }>,
  legacyHash: "" as string,
  legacyCreatedAt: new Date(),
}));

vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/LauncherCredential", () => ({
  default: {
    create: async (doc: { userId: string; tokenHash: string }) => {
      state.credentials.push({ ...doc, createdAt: new Date(), revokedAt: null });
    },
    exists: async ({ userId }: { userId: string }) => state.credentials.some((item) => item.userId === userId),
    findOne: ({ tokenHash, revokedAt }: { tokenHash: string; revokedAt: null }) => ({
      select: async () => state.credentials.find((item) => item.tokenHash === tokenHash && item.revokedAt === revokedAt) || null,
    }),
    updateOne: async ({ tokenHash }: { tokenHash: string }, update: { $set: { revokedAt: Date } }) => {
      const item = state.credentials.find((entry) => entry.tokenHash === tokenHash);
      if (item) item.revokedAt = update.$set.revokedAt;
    },
  },
}));
vi.mock("@/lib/models/User", () => ({
  default: {
    findById: () => ({ select: async () => ({ _id: "user-1", disabled: false, email: "player@example.com" }) }),
    findOne: ({ launcherTokenHash }: { launcherTokenHash: string }) => ({
      select: async () => launcherTokenHash === state.legacyHash
        ? { _id: "user-1", disabled: false, launcherTokenCreatedAt: state.legacyCreatedAt }
        : null,
    }),
    updateOne: async ({ launcherTokenHash }: { launcherTokenHash: string }) => {
      if (launcherTokenHash !== state.legacyHash) return { matchedCount: 0 };
      state.legacyHash = "";
      return { matchedCount: 1 };
    },
  },
}));

import {
  hashLauncherToken, hasLauncherConnection, issueLauncherTokenForUser,
  revokeLauncherToken, userFromLauncherBearer,
} from "@/lib/library";

const requestFor = (token: string) => new Request("https://playbound.club/api/library/token", {
  headers: { authorization: `Bearer ${token}` },
});

describe("launcher credentials across PCs", () => {
  it("keeps both launchers signed in and revokes only the launcher signing out", async () => {
    state.credentials.length = 0;
    state.legacyHash = "";
    const desktop = await issueLauncherTokenForUser("user-1");
    const laptop = await issueLauncherTokenForUser("user-1");
    expect(desktop).not.toBe(laptop);
    expect(await hasLauncherConnection("user-1")).toBe(true);
    expect((await userFromLauncherBearer(requestFor(desktop)))?._id).toBe("user-1");
    expect((await userFromLauncherBearer(requestFor(laptop)))?._id).toBe("user-1");

    expect(await revokeLauncherToken(laptop)).toBe(true);
    expect(await userFromLauncherBearer(requestFor(laptop))).toBeNull();
    expect((await userFromLauncherBearer(requestFor(desktop)))?._id).toBe("user-1");
  });

  it("keeps a legacy desktop token valid while another PC receives a new credential", async () => {
    state.credentials.length = 0;
    const legacy = "old-desktop-token";
    state.legacyHash = hashLauncherToken(legacy);
    state.legacyCreatedAt = new Date();
    const laptop = await issueLauncherTokenForUser("user-1");
    expect((await userFromLauncherBearer(requestFor(legacy)))?._id).toBe("user-1");
    expect((await userFromLauncherBearer(requestFor(laptop)))?._id).toBe("user-1");
    expect(await revokeLauncherToken(legacy)).toBe(true);
    expect(await userFromLauncherBearer(requestFor(legacy))).toBeNull();
    expect((await userFromLauncherBearer(requestFor(laptop)))?._id).toBe("user-1");
  });
});

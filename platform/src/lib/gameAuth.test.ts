import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * In-memory stand-ins for the GameLink and User models, just rich enough for
 * the queries gameAuth makes: equality, { $gt } on dates, $set updates, and
 * the .lean() / .select() chains.
 */
type Row = Record<string, unknown>;
const links: Row[] = [];
const issued: { userId: string; client?: string }[] = [];

function matches(row: Row, query: Row): boolean {
  return Object.entries(query).every(([k, v]) => {
    if (v && typeof v === "object" && "$gt" in (v as Row)) {
      return (row[k] as Date).getTime() > ((v as Row).$gt as Date).getTime();
    }
    return row[k] === v;
  });
}

function chain<T>(value: T) {
  const c = { lean: () => c, select: () => c, then: (r: (v: T) => unknown) => Promise.resolve(value).then(r) };
  return c;
}

vi.mock("@/lib/db", () => ({ default: async () => undefined }));
vi.mock("@/lib/models/GameLink", () => ({
  default: {
    create: async (doc: Row) => {
      if (links.some((l) => l.code === doc.code)) throw Object.assign(new Error("dup"), { code: 11000 });
      links.push({ status: "pending", userId: null, ...doc });
    },
    findOne: (query: Row) => chain(links.find((l) => matches(l, query)) ?? null),
    findOneAndUpdate: (query: Row, update: { $set: Row }) => {
      const row = links.find((l) => matches(l, query));
      if (row) Object.assign(row, update.$set);
      return chain(row ?? null);
    },
  },
}));
vi.mock("@/lib/models/User", () => ({
  default: { findById: (id: string) => chain(id === "u-banned" ? { username: "x", disabled: true } : { username: "mick" }) },
}));
vi.mock("@/lib/library", async () => {
  const crypto = await import("crypto");
  return {
    hashLauncherToken: (t: string) => crypto.createHash("sha256").update(t).digest("hex"),
    issueLauncherTokenForUser: async (userId: string, client?: string) => {
      issued.push({ userId, client });
      return `token-for-${userId}`;
    },
  };
});

const auth = await import("@/lib/gameAuth");

beforeEach(() => {
  links.length = 0;
  issued.length = 0;
});

describe("link codes", () => {
  it("mints 8 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = auth.mintLinkCode();
      expect(code).toHaveLength(8);
      expect(code).not.toMatch(/[01OI]/);
      expect(auth.normalizeLinkCode(code)).toBe(code);
    }
  });

  it("accepts the code however the player types it", () => {
    expect(auth.normalizeLinkCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(auth.normalizeLinkCode(" ABCD EFGH ")).toBe("ABCDEFGH");
    expect(auth.normalizeLinkCode("ABCD-EFG")).toBeNull();
    expect(auth.normalizeLinkCode("ABCD-EFG0")).toBeNull(); // 0 is never issued
    expect(auth.formatLinkCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(auth.gameLinkUrl("ABCDEFGH")).toMatch(/\/link\?code=ABCD-EFGH$/);
  });

  it("only allows plain slugs and printable device names", () => {
    expect(auth.normalizeGameSlug("HyperDisc-Arena")).toBe("hyperdisc-arena");
    expect(auth.normalizeGameSlug("../etc")).toBeNull();
    expect(auth.sanitizeDeviceName("DESKTOP-1 <script>")).toBe("DESKTOP-1 script");
    expect(auth.titleFromSlug("hyperdisc-arena")).toBe("Hyperdisc Arena");
  });
});

describe("game sign-in flow", () => {
  it("pending until approved, then a token exactly once", async () => {
    const link = await auth.createGameLink({ gameSlug: "hyperdisc-arena", deviceName: "PC" });
    expect(await auth.pollGameLink(link.pollToken)).toEqual({ status: "pending" });
    expect(await auth.findPendingGameLink(link.code)).toMatchObject({ gameSlug: "hyperdisc-arena", deviceName: "PC" });

    expect(await auth.respondToGameLink(link.code, "u1", true)).toBe("approved");
    const result = await auth.pollGameLink(link.pollToken);
    expect(result).toEqual({ status: "approved", token: "token-for-u1", user: { id: "u1", username: "mick" } });
    expect(issued).toEqual([{ userId: "u1", client: "game:hyperdisc-arena" }]);

    // The poll secret can't mint a second token.
    expect(await auth.pollGameLink(link.pollToken)).toEqual({ status: "invalid" });
    expect(issued).toHaveLength(1);
    // And the code can't be approved again.
    expect(await auth.respondToGameLink(link.code, "u2", true)).toBe("not_found");
  });

  it("a denied link never yields a token", async () => {
    const link = await auth.createGameLink({ gameSlug: "hyperdisc-arena", deviceName: "" });
    expect(await auth.respondToGameLink(link.code, "u1", false)).toBe("denied");
    expect(await auth.pollGameLink(link.pollToken)).toEqual({ status: "denied" });
    expect(issued).toHaveLength(0);
  });

  it("expired links can't be approved or claimed", async () => {
    const link = await auth.createGameLink({ gameSlug: "hyperdisc-arena", deviceName: "" });
    links[0].expiresAt = new Date(Date.now() - 1000);
    expect(await auth.respondToGameLink(link.code, "u1", true)).toBe("not_found");
    expect(await auth.pollGameLink(link.pollToken)).toEqual({ status: "expired" });
    expect(await auth.findPendingGameLink(link.code)).toBeNull();
  });

  it("rejects unknown poll secrets and disabled accounts", async () => {
    expect(await auth.pollGameLink("nope")).toEqual({ status: "invalid" });
    expect(await auth.pollGameLink("")).toEqual({ status: "invalid" });
    const link = await auth.createGameLink({ gameSlug: "hyperdisc-arena", deviceName: "" });
    await auth.respondToGameLink(link.code, "u-banned", true);
    expect(await auth.pollGameLink(link.pollToken)).toEqual({ status: "invalid" });
    expect(issued).toHaveLength(0);
  });
});

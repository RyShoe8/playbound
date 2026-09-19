import { describe, it, expect, vi } from "vitest";
import { canEditGame, canEditDeveloper } from "./developerAccess";

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/models/Developer", () => ({
  default: {
    findOne: vi.fn((query: { slug?: string; ownerUserId?: string }) => ({
      select: () => ({
        lean: () => {
          if (query.slug === "owned-studio" && query.ownerUserId === "dev-user-1") {
            return Promise.resolve({ _id: "studio-doc-1" });
          }
          return Promise.resolve(null);
        },
      }),
    })),
  },
}));

describe("developerAccess", () => {
  describe("canEditGame", () => {
    it("allows site admins to edit any game", async () => {
      const admin = { id: "admin-user", role: "admin" };
      const game = { ownerUserId: "other-user", developerSlug: "other-studio" };
      expect(await canEditGame(admin, game)).toBe(true);
    });

    it("allows direct owner to edit their game", async () => {
      const dev = { id: "dev-user-1", role: "developer" };
      const game = { ownerUserId: "dev-user-1", developerSlug: "some-studio" };
      expect(await canEditGame(dev, game)).toBe(true);
    });

    it("allows studio owner to edit games crediting their studio", async () => {
      const dev = { id: "dev-user-1", role: "developer" };
      const game = { ownerUserId: null, developerSlug: "owned-studio" };
      expect(await canEditGame(dev, game)).toBe(true);
    });

    it("denies unassociated users from editing a game", async () => {
      const stranger = { id: "stranger-user", role: "developer" };
      const game = { ownerUserId: "other-user", developerSlug: "unowned-studio" };
      expect(await canEditGame(stranger, game)).toBe(false);
    });

    it("denies unauthenticated visitors", async () => {
      const game = { ownerUserId: "dev-user-1", developerSlug: "owned-studio" };
      expect(await canEditGame(null, game)).toBe(false);
      expect(await canEditGame(undefined, game)).toBe(false);
    });
  });

  describe("canEditDeveloper", () => {
    it("allows site admins to edit any developer profile", () => {
      const admin = { id: "admin-user", role: "admin" };
      const devDoc = { ownerUserId: "other-user" };
      expect(canEditDeveloper(admin, devDoc)).toBe(true);
    });

    it("allows studio owner to edit their developer profile", () => {
      const dev = { id: "dev-user-1", role: "developer" };
      const devDoc = { ownerUserId: "dev-user-1" };
      expect(canEditDeveloper(dev, devDoc)).toBe(true);
    });

    it("denies unassociated users from editing developer profile", () => {
      const stranger = { id: "stranger-user", role: "user" };
      const devDoc = { ownerUserId: "other-user" };
      expect(canEditDeveloper(stranger, devDoc)).toBe(false);
    });
  });
});

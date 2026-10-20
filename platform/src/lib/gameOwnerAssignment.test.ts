import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.hoisted(() => vi.fn());
const findById = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/models/User", () => ({ default: { findOne, findById } }));
vi.mock("@/lib/mailer", async (importOriginal) => ({ ...await importOriginal<typeof import("./mailer")>(), sendMail }));

import { isNewGameAssignment, notifyGameAssigned, resolveGameOwnerUserId } from "./gameOwnerAssignment";
import { gameAssignmentEmailHtml } from "./mailer";

describe("game owner assignment", () => {
  beforeEach(() => {
    findOne.mockReset();
    findById.mockReset();
    sendMail.mockReset();
    findOne.mockImplementation((query) => ({
      select: () => ({ lean: async () => query.email === "dev@example.com" || query._id === "507f1f77bcf86cd799439011" ||
        query.$or?.[0]?.usernameNormalized === "developer" ? { _id: "507f1f77bcf86cd799439011" } : null }),
    }));
  });

  it("accepts username, email, and existing user ID", async () => {
    expect(await resolveGameOwnerUserId(" Developer ")).toBe("507f1f77bcf86cd799439011");
    expect(await resolveGameOwnerUserId("DEV@example.com")).toBe("507f1f77bcf86cd799439011");
    expect(await resolveGameOwnerUserId("507f1f77bcf86cd799439011")).toBe("507f1f77bcf86cd799439011");
  });

  it("clears an empty assignment and rejects an unknown account", async () => {
    expect(await resolveGameOwnerUserId(null)).toBeNull();
    expect(await resolveGameOwnerUserId("  ")).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
    expect(await resolveGameOwnerUserId("unknown")).toBeNull();
  });

  it("escapes regex characters when checking a legacy username", async () => {
    await resolveGameOwnerUserId("dev.*");
    const query = findOne.mock.calls[0][0];
    expect(query.$or[1].username.$regex.test("devXanything")).toBe(false);
    expect(query.$or[1].username.$regex.test("dev.*")).toBe(true);
  });

  it("notifies only when an account newly receives ownership", () => {
    expect(isNewGameAssignment(null, "507f1f77bcf86cd799439011")).toBe(true);
    expect(isNewGameAssignment("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439011")).toBe(false);
    expect(isNewGameAssignment("507f1f77bcf86cd799439011", null)).toBe(false);
  });

  it("escapes account and game names in the notification email", () => {
    const html = gameAssignmentEmailHtml("<Dev>", "Racing & <Fun>", "https://playbound.club/developer/games/racing/edit");
    expect(html).toContain("&lt;Dev&gt;");
    expect(html).toContain("Racing &amp; &lt;Fun&gt;");
    expect(html).toContain('href="https://playbound.club/developer/games/racing/edit"');
    expect(html).not.toContain("<Dev>");
  });

  it("emails the assigned user's direct management link", async () => {
    findById.mockReturnValue({ select: () => ({ lean: async () => ({ username: "Developer", email: "dev@example.com" }) }) });
    sendMail.mockResolvedValue(undefined);
    expect(await notifyGameAssigned("507f1f77bcf86cd799439011", "A Racing Game", "a-racing-game")).toBe(true);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0]).toBe("dev@example.com");
    expect(sendMail.mock.calls[0][2]).toContain("https://playbound.club/developer/games/a-racing-game/edit");
  });
});

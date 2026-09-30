import { describe, expect, it } from "vitest";
import { canViewAdmin, canWriteAdmin } from "./adminAccess";

describe("admin access levels", () => {
  it("lets Admin Viewer read but never write", () => {
    expect(canViewAdmin("admin_viewer")).toBe(true);
    expect(canWriteAdmin("admin_viewer")).toBe(false);
  });

  it("keeps full Admin access", () => {
    expect(canViewAdmin("admin")).toBe(true);
    expect(canWriteAdmin("admin")).toBe(true);
  });

  it.each(["user", "developer", null, undefined, "unknown"]) (
    "denies admin access to %s",
    (role) => {
      expect(canViewAdmin(role)).toBe(false);
      expect(canWriteAdmin(role)).toBe(false);
    },
  );
});

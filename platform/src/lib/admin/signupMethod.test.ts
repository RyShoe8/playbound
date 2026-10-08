import { describe, expect, it } from "vitest";
import { signupMethodLabel } from "./signupMethod";

describe("signupMethodLabel", () => {
  it("keeps the original signup method after Google is linked to a password account", () => {
    expect(signupMethodLabel({ signupMethod: "standard", authProviders: ["google"], hasPassword: true })).toBe("Standard");
  });

  it("infers legacy accounts with only one sign-in method", () => {
    expect(signupMethodLabel({ authProviders: ["google"], hasPassword: false })).toBe("Google");
    expect(signupMethodLabel({ authProviders: [], hasPassword: true })).toBe("Standard");
  });

  it("does not guess the original method for legacy linked accounts", () => {
    expect(signupMethodLabel({ authProviders: ["google"], hasPassword: true })).toBe("Unknown");
  });
});

import { describe, expect, it } from "vitest";
import {
  couchCodeEntryHint,
  couchJoinPath,
  couchJoinUrl,
  normalizeCouchJoinCode,
} from "./joinUrl";

describe("couch join URLs", () => {
  it("uses the short /c path", () => {
    expect(couchJoinPath("ab3d")).toBe("/c/AB3D");
    expect(couchJoinUrl("ab3d", "https://playbound.club")).toBe("https://playbound.club/c/AB3D");
  });

  it("names the typeable entry page", () => {
    expect(couchCodeEntryHint("playbound.club")).toBe("playbound.club/c");
  });

  it("normalizes typed codes", () => {
    expect(normalizeCouchJoinCode(" ab-3d! ")).toBe("AB-3D");
  });
});

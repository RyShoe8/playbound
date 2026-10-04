import { it, expect } from "vitest";
import { validAssetName, validateUpload } from "./storage";
it("restricts uploads to supported media and bounded sizes", () => {
  expect(validateUpload({ filename: "song.OGG", size: 123 }).contentType).toBe("audio/ogg");
  for (const b of [{ filename: "run.exe", size: 123 }, { filename: "song.mp3", size: 0 }, { filename: "song.mp3", size: 51 * 1024 * 1024 }]) expect(() => validateUpload(b)).toThrow();
});
it("excludes private bucket objects from public download routes", () => {
  expect(validAssetName("01234567-abcd-abcd-abcd-0123456789ab.ogg")).toBe(true);
  for (const name of ["../saves/private.zip", "launcher.exe", "secret", "01234567-abcd-abcd-abcd-0123456789ab.exe"]) expect(validAssetName(name)).toBe(false);
});

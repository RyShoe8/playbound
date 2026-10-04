import { expect, it } from "vitest";
import { MixtapeTrack } from "../models/Mixtape";

it("allows a track to be saved with every editable field blank", async () => {
  const track = new MixtapeTrack({ tapeId: "partial-track", title: "", artist: "", audioUrl: "" });
  await expect(track.validate()).resolves.toBeUndefined();
  expect(track.coverUrl).toBe("");
  expect(track.year).toBeNull();
});

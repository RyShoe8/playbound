import { describe, expect, it } from "vitest";
import {
  formatDataVolume,
  formatTransferProgress,
  formatVpsTransferMessage,
  formatR2TransferMessage,
  transferPercent,
  vpsTransferPercent,
} from "@/lib/mirrors/vpsProgress";

describe("vpsProgress", () => {
  it("formats volumes", () => {
    expect(formatDataVolume(0)).toBe("0 B");
    expect(formatDataVolume(1024)).toBe("1.0 KB");
    expect(formatDataVolume(1048576)).toBe("1.0 MB");
  });

  it("computes transfer percent", () => {
    expect(transferPercent(50, 100)).toBe(50);
    expect(vpsTransferPercent(50, 100)).toBe(50);
    expect(vpsTransferPercent(0, 100)).toBe(0);
    expect(vpsTransferPercent(10, 0)).toBeNull();
  });

  it("formats status messages", () => {
    expect(formatVpsTransferMessage(0, 0)).toMatch(/queued/i);
    expect(formatVpsTransferMessage(52428800, 104857600)).toMatch(/50%/);
    expect(formatVpsTransferMessage(1024, null)).toMatch(/Copied/);
    expect(formatR2TransferMessage(0, 0)).toMatch(/Uploading/);
    expect(formatR2TransferMessage(52428800, 104857600)).toMatch(/50%/);
  });

  it("formats combined transfer progress", () => {
    const p = formatTransferProgress(52428800, 104857600);
    expect(p.percent).toBe(50);
    expect(p.transferredText).toBe("50.0 MB");
    expect(p.totalText).toBe("100 MB");
    expect(p.formatted).toContain("50%");
  });
});


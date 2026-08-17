import { describe, it, expect } from "vitest";
import { evaluateSourceHealth, calculateArtifactCacheScore } from "./scoring";

describe("Mirror Intelligence & Scoring System", () => {
  describe("evaluateSourceHealth", () => {
    it("returns unknown when no attempts have been recorded", () => {
      const status = evaluateSourceHealth({
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        checksumFailureCount: 0,
      });
      expect(status).toBe("unknown");
    });

    it("returns healthy when success rate is high", () => {
      const status = evaluateSourceHealth({
        successCount: 98,
        failureCount: 2,
        timeoutCount: 0,
        checksumFailureCount: 0,
        lastSuccess: new Date(),
      });
      expect(status).toBe("healthy");
    });

    it("returns degraded when failure rate exceeds 20%", () => {
      const status = evaluateSourceHealth({
        successCount: 65,
        failureCount: 35,
        timeoutCount: 5,
        checksumFailureCount: 0,
        lastSuccess: new Date(),
      });
      expect(status).toBe("degraded");
    });

    it("returns failing when checksum failures occur repeatedly", () => {
      const status = evaluateSourceHealth({
        successCount: 50,
        failureCount: 10,
        timeoutCount: 0,
        checksumFailureCount: 2,
        lastSuccess: new Date(),
      });
      expect(status).toBe("failing");
    });

    it("returns failing when failure rate exceeds 80%", () => {
      const status = evaluateSourceHealth({
        successCount: 1,
        failureCount: 9,
        timeoutCount: 4,
        checksumFailureCount: 0,
        lastFailure: new Date(),
      });
      expect(status).toBe("failing");
    });
  });

  describe("calculateArtifactCacheScore", () => {
    it("calculates high cache score for popular game with degraded/failing public mirror", () => {
      const breakdown = calculateArtifactCacheScore(
        {
          sizeBytes: 183 * 1024 * 1024, // 183 MB
          totalDownloads: 850,
          recentDownloads: 45,
          averageDownloadSpeed: 450 * 1024, // 450 KB/s (sluggish)
          publicSuccessCount: 120,
          publicFailureCount: 85,
          lastPublicSuccess: new Date(),
          lastPublicFailure: new Date(),
        },
        [
          {
            healthStatus: "degraded",
            averageDownloadSpeed: 450 * 1024,
            failureCount: 85,
            successCount: 120,
          },
        ]
      );

      expect(breakdown.reliabilityProblem).toBeGreaterThanOrEqual(20);
      expect(breakdown.recentDemandScore).toBeGreaterThanOrEqual(20);
      expect(breakdown.speedPenalty).toBe(15);
      expect(breakdown.totalScore).toBeGreaterThanOrEqual(75);
    });

    it("calculates low cache score for reliable public mirror with low demand", () => {
      const breakdown = calculateArtifactCacheScore(
        {
          sizeBytes: 4 * 1024 * 1024 * 1024, // 4 GB
          totalDownloads: 4,
          recentDownloads: 0,
          averageDownloadSpeed: 15 * 1024 * 1024, // 15 MB/s
          publicSuccessCount: 4,
          publicFailureCount: 0,
          lastPublicSuccess: new Date(),
        },
        [
          {
            healthStatus: "healthy",
            averageDownloadSpeed: 15 * 1024 * 1024,
            failureCount: 0,
            successCount: 4,
          },
        ]
      );

      expect(breakdown.reliabilityProblem).toBe(0);
      expect(breakdown.sizePenalty).toBeGreaterThanOrEqual(15);
      expect(breakdown.totalScore).toBeLessThanOrEqual(30);
    });

    it("penalizes inactive artifacts with zero recent downloads", () => {
      const oldDate = new Date(Date.now() - 40 * 86400000); // 40 days ago
      const breakdown = calculateArtifactCacheScore(
        {
          sizeBytes: 50 * 1024 * 1024,
          totalDownloads: 20,
          recentDownloads: 0,
          averageDownloadSpeed: 2 * 1024 * 1024,
          publicSuccessCount: 20,
          publicFailureCount: 0,
          lastPublicSuccess: oldDate,
        },
        [
          {
            healthStatus: "healthy",
            averageDownloadSpeed: 2 * 1024 * 1024,
            failureCount: 0,
            successCount: 20,
          },
        ]
      );

      expect(breakdown.inactivityPenalty).toBe(25);
    });
  });

  describe("R2 Budget & Rebalancing Logic", () => {
    it("verifies budget calculations and conversion", () => {
      const budgetGB = 8.0;
      const budgetBytes = budgetGB * 1024 * 1024 * 1024;
      const currentBytes = 7.4 * 1024 * 1024 * 1024;
      const candidateBytes = 1.5 * 1024 * 1024 * 1024;

      const fitsDirectly = currentBytes + candidateBytes <= budgetBytes;
      expect(fitsDirectly).toBe(false);

      const evictableBytes = 1.2 * 1024 * 1024 * 1024;
      const fitsAfterEviction = currentBytes - evictableBytes + candidateBytes <= budgetBytes;
      expect(fitsAfterEviction).toBe(true);
    });
  });
});

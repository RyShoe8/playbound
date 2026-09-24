import { z } from "zod";

const percent = z.number().min(0).max(100);
export const hostingSettingsSchema = z.object({
  enabled: z.boolean(),
  node: z.object({
    key: z.string().min(1).max(50), regionKey: z.string().min(1).max(50),
    regionLabel: z.string().min(1).max(100), enabled: z.boolean(), draining: z.boolean(),
  }),
  safety: z.object({
    maxCpuPercent: percent.min(1).max(95), maxRamPercent: percent.min(1).max(95),
    minFreeRamBytes: z.number().int().min(0), maxMetricsAgeSeconds: z.number().int().min(30).max(900),
  }),
  budget: z.object({ cpuCores: z.number().min(0), ramBytes: z.number().int().min(0) }),
  monitoring: z.object({
    cpuWarningPercent: percent, cpuCriticalPercent: percent,
    ramWarningPercent: percent, ramCriticalPercent: percent,
    diskWarningPercent: percent, diskCriticalPercent: percent,
  }),
  rotation: z.object({
    minimumOnlineMinutes: z.number().int().min(0).max(10080),
    idleMinutes: z.number().int().min(15).max(10080),
    cooldownMinutes: z.number().int().min(0).max(10080),
  }),
}).refine((s) =>
  s.monitoring.cpuWarningPercent < s.monitoring.cpuCriticalPercent &&
  s.monitoring.cpuCriticalPercent <= s.safety.maxCpuPercent &&
  s.monitoring.ramWarningPercent < s.monitoring.ramCriticalPercent &&
  s.monitoring.ramCriticalPercent <= s.safety.maxRamPercent &&
  s.monitoring.diskWarningPercent < s.monitoring.diskCriticalPercent,
  { message: "Warning must be below critical; CPU/RAM critical must not exceed the safety limit" }
).refine((s) => !s.enabled || (s.node.enabled && !s.node.draining && s.budget.cpuCores > 0 && s.budget.ramBytes > 0), {
  message: "Enable the node and set a positive hosting budget before enabling automation",
});

export type HostingSettings = z.infer<typeof hostingSettingsSchema>;

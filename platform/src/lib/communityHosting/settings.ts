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
}).superRefine((s, ctx) => {
  // One message per broken rule, naming the fields and values, so the admin
  // form says exactly what to change instead of a combined sentence.
  const m = s.monitoring;
  const rules: Array<[boolean, string]> = [
    [m.cpuWarningPercent < m.cpuCriticalPercent, `CPU warning (${m.cpuWarningPercent}%) must be below CPU critical (${m.cpuCriticalPercent}%)`],
    [m.cpuCriticalPercent <= s.safety.maxCpuPercent, `CPU critical (${m.cpuCriticalPercent}%) must not exceed Maximum CPU (${s.safety.maxCpuPercent}%)`],
    [m.ramWarningPercent < m.ramCriticalPercent, `RAM warning (${m.ramWarningPercent}%) must be below RAM critical (${m.ramCriticalPercent}%)`],
    [m.ramCriticalPercent <= s.safety.maxRamPercent, `RAM critical (${m.ramCriticalPercent}%) must not exceed Maximum RAM (${s.safety.maxRamPercent}%)`],
    [m.diskWarningPercent < m.diskCriticalPercent, `Disk warning (${m.diskWarningPercent}%) must be below disk critical (${m.diskCriticalPercent}%)`],
  ];
  const broken = rules.filter(([ok]) => !ok).map(([, msg]) => msg);
  if (broken.length) ctx.addIssue({ code: "custom", message: broken.join("; ") });
}).refine((s) => !s.enabled || (s.node.enabled && !s.node.draining && s.budget.cpuCores > 0 && s.budget.ramBytes > 0), {
  message: "Enable the node and set a positive hosting budget before enabling automation",
});

export type HostingSettings = z.infer<typeof hostingSettingsSchema>;

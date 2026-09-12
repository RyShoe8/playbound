/**
 * Format Blob→VPS archive progress for admin status lines.
 */

export function formatDataVolume(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function vpsTransferPercent(bytesReceived: number, sizeBytes: number): number | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  if (!Number.isFinite(bytesReceived) || bytesReceived < 0) return 0;
  return Math.min(100, Math.round((bytesReceived / sizeBytes) * 1000) / 10);
}

export function formatVpsTransferMessage(
  bytesReceived?: number | null,
  sizeBytes?: number | null
): string {
  const received = Number(bytesReceived) || 0;
  const total = Number(sizeBytes) || 0;
  if (total > 0) {
    const pct = vpsTransferPercent(received, total);
    return `Copied ${formatDataVolume(received)} of ${formatDataVolume(total)}${pct != null ? ` (${pct}%)` : ""}`;
  }
  if (received > 0) return `Copied ${formatDataVolume(received)}…`;
  return "Transfer queued on the VPS.";
}

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

export function transferPercent(bytesReceived: number, sizeBytes: number): number | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  if (!Number.isFinite(bytesReceived) || bytesReceived < 0) return 0;
  return Math.min(100, Math.round((bytesReceived / sizeBytes) * 1000) / 10);
}

export function vpsTransferPercent(bytesReceived: number, sizeBytes: number): number | null {
  return transferPercent(bytesReceived, sizeBytes);
}

export function formatTransferProgress(
  bytesTransferred?: number | null,
  totalBytes?: number | null
): { percent: number | null; transferredText: string; totalText: string; formatted: string } {
  const transferred = Number(bytesTransferred) || 0;
  const total = Number(totalBytes) || 0;
  const pct = transferPercent(transferred, total);
  const transferredText = formatDataVolume(transferred);
  const totalText = formatDataVolume(total);
  const formatted =
    total > 0
      ? `${transferredText} of ${totalText}${pct != null ? ` (${pct}%)` : ""}`
      : transferred > 0
      ? `${transferredText}…`
      : "0 B";
  return { percent: pct, transferredText, totalText, formatted };
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

export function formatR2TransferMessage(
  bytesUploaded?: number | null,
  totalBytes?: number | null
): string {
  const uploaded = Number(bytesUploaded) || 0;
  const total = Number(totalBytes) || 0;
  if (total > 0) {
    const pct = transferPercent(uploaded, total);
    return `Uploaded ${formatDataVolume(uploaded)} of ${formatDataVolume(total)}${pct != null ? ` (${pct}%)` : ""}`;
  }
  if (uploaded > 0) return `Uploaded ${formatDataVolume(uploaded)}…`;
  return "Uploading to Cloudflare R2…";
}


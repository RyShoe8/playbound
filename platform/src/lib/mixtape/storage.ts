const types: Record<string, string> = { ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
export function validAssetName(name: unknown): name is string {
  return typeof name === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(ogg|mp3|wav|png|jpe?g)$/.test(name);
}
export function validateUpload(body: { filename?: unknown; size?: unknown }) {
  const extension = String(body.filename || "").split(".").pop()?.toLowerCase() || "";
  const contentType = types[extension], size = Number(body.size);
  if (!contentType) throw new Error("Choose OGG, MP3, WAV, PNG or JPG");
  if (!Number.isInteger(size) || size < 1 || size > 50 * 1024 * 1024) throw new Error("Files must be between 1 byte and 50 MiB");
  return { extension, contentType, size };
}

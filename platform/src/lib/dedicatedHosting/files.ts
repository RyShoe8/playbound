import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import { profileRecipeSlug } from "@/lib/communityHosting/profileRecipe";
import { filesOnHost } from "@/lib/gameHost/client";
import { authorizeServer, recordActivity, type Fail } from "./access";
import { hasWorldBackups, isStoppedForRestore } from "./worldBackups";

export async function manageFiles(userId: string, serverId: string, input: unknown) {
  if (!input || typeof input !== "object") return { error: "Invalid file request", status: 400 } satisfies Fail;
  const body = input as Record<string, unknown>;
  if (!["list", "read", "stat", "read-chunk", "history", "write", "delete", "restore", "mkdir", "upload-begin", "upload-chunk", "upload-commit", "upload-cancel"].includes(String(body.action))) return { error: "Unknown file operation", status: 400 } satisfies Fail;
  const write = ["write", "delete", "restore", "mkdir", "upload-begin", "upload-chunk", "upload-commit", "upload-cancel"].includes(String(body.action));
  const auth = await authorizeServer(userId, serverId, write ? "server:write_files" : "server:read_files");
  if ("error" in auth) return auth;
  if (write && body.action !== "upload-cancel" && !isStoppedForRestore(auth.server)) return { error: "Stop the server before changing its files.", status: 409 } satisfies Fail;
  const profile = await CommunityServerProfile.findOne({ key: auth.server.profileKey }).select({ recipeSlug: 1 }).lean();
  const recipe = profileRecipeSlug({ gameSlug: auth.server.gameSlug, editionSlug: auth.server.editionSlug, recipeSlug: profile?.recipeSlug });
  if (!hasWorldBackups(recipe)) return { error: "This game has no isolated saved-data folder.", status: 400 } satisfies Fail;
  const path = typeof body.path === "string" ? body.path : "";
  if (path.length > 500 || (body.contentBase64 != null && (typeof body.contentBase64 !== "string" || body.contentBase64.length > 4 * 1024 ** 2))) return { error: "File request is too large. Send large saves in chunks.", status: 400 } satisfies Fail;
  const result = await filesOnHost(serverId, { action: body.action, gameSlug: recipe, path, expectedEtag: body.expectedEtag, contentBase64: body.contentBase64, revision: body.revision, uploadId: body.uploadId, offset: body.offset, bytes: body.bytes, version: body.version, actor: userId });
  if (!result.ok) return { error: result.error, status: 409 } satisfies Fail;
  if (write && !["upload-begin", "upload-chunk", "upload-cancel"].includes(String(body.action))) await recordActivity(serverId, { id: userId }, `file_${body.action}`, path);
  return { data: result.data };
}

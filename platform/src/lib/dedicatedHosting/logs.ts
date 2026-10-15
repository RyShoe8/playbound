import { authorizeServer } from "./access";
import { logsOnHost } from "@/lib/gameHost/client";

export async function getServerLogs(userId: string, serverId: string) {
  const auth = await authorizeServer(userId, serverId, "server:read_logs");
  if ("error" in auth) return auth;
  try { return { snapshot: await logsOnHost(String(auth.server._id)), status: 200 as const }; }
  catch { return { error: "Server output is temporarily unavailable. Please retry.", status: 503 as const }; }
}

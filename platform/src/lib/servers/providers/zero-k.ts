import net from 'net';
import crypto from 'crypto';
import type { GameServer } from "../types";
import { getServerLobbyAuth } from "@/lib/catalog";
import { attachGeo } from "../geo";

export async function fetchZeroKServers(): Promise<GameServer[]> {
  const auth = await getServerLobbyAuth("zero-k");
  if (!auth?.username || !auth?.password) {
    throw new Error("Zero-K lobby auth missing in database");
  }

  const passwordHash = crypto.createHash("md5").update(auth.password).digest("base64");
  const loginCmd = `Login {"Name":"${auth.username}", "PasswordHash":"${passwordHash}"}\n`;

  return new Promise((resolve, reject) => {
    const servers: GameServer[] = [];
    const client = new net.Socket();
    let dataBuffer = "";

    const timer = setTimeout(() => {
      client.destroy();
      resolve(attachGeo(servers));
    }, 5000); // 5 seconds should be enough to receive all BattleAdded lines after login

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    client.connect(8200, "zero-k.info", () => {
      client.write(loginCmd);
    });

    client.on('data', (d) => {
      dataBuffer += d.toString('utf8');
      
      const lines = dataBuffer.split('\n');
      dataBuffer = lines.pop() || '';

      for (let line of lines) {
        line = line.trim();
        if (line.startsWith("BattleAdded ")) {
          try {
            const jsonStr = line.substring("BattleAdded ".length).trim();
            const msg = JSON.parse(jsonStr);
            const header = msg.Header;
            
            if (header && header.BattleID != null) {
              const maxPlayers = header.MaxPlayers || 16;
              const hasPassword = !!header.Password;

              servers.push({
                id: `zero-k:${header.BattleID}`,
                name: header.Title || `Battle ${header.BattleID}`,
                host: "zero-k.info",
                port: 8200,
                players: header.PlayerCount || 0,
                maxPlayers: maxPlayers,
                protected: hasPassword,
                map: header.Map || "Unknown",
                gameType: header.Game || "Zero-K",
                location: null,
              });
            }
          } catch (e) {
            console.error("Zero-K JSON parse error:", e);
          }
        }
      }
    });
  });
}

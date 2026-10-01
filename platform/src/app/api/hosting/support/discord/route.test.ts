import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const oldUrl = process.env.DISCORD_BOT_WEBHOOK_URL;
const oldSecret = process.env.BOT_WEBHOOK_SECRET;

afterEach(() => {
  if (oldUrl === undefined) delete process.env.DISCORD_BOT_WEBHOOK_URL;
  else process.env.DISCORD_BOT_WEBHOOK_URL = oldUrl;
  if (oldSecret === undefined) delete process.env.BOT_WEBHOOK_SECRET;
  else process.env.BOT_WEBHOOK_SECRET = oldSecret;
  vi.unstubAllGlobals();
});

describe("dedicated Discord support handoff", () => {
  it("redirects to the channel-specific invite returned by the bot", async () => {
    process.env.DISCORD_BOT_WEBHOOK_URL = "https://bot.example.test";
    process.env.BOT_WEBHOOK_SECRET = "test-secret";
    const fetchMock = vi.fn(async () => Response.json({ inviteUrl: "https://discord.gg/abc123" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://discord.gg/abc123");
    expect(fetchMock).toHaveBeenCalledWith("https://bot.example.test/hosting-support", expect.objectContaining({ method: "POST" }));
  });

  it("rejects a non-Discord redirect", async () => {
    process.env.DISCORD_BOT_WEBHOOK_URL = "https://bot.example.test";
    process.env.BOT_WEBHOOK_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ inviteUrl: "https://example.test/redirect" })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET();
    expect(response.status).toBe(503);
    log.mockRestore();
  });
});

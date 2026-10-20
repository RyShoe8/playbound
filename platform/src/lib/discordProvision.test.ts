import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/site", () => ({ IS_PRODUCTION: true, SITE_URL: "https://playbound.club" }));

const abort = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

describe("Discord provisioning against a worker that may be asleep", () => {
  beforeEach(() => {
    process.env.DISCORD_BOT_WEBHOOK_URL = "https://bot.example.com/";
    process.env.BOT_WEBHOOK_SECRET = "secret";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DISCORD_BOT_WEBHOOK_URL;
    delete process.env.BOT_WEBHOOK_SECRET;
  });

  it("retries a timed-out provision once, which finds the worker awake", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abort())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ channelId: "123" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { requestDiscordProvision } = await import("./discordProvision");
    await expect(requestDiscordProvision("hydorah")).resolves.toEqual({ channelId: "123" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://bot.example.com/provision");
  });

  it("does not retry a real failure, and still swallows it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "bot exploded" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { requestDiscordProvision } = await import("./discordProvision");
    await expect(requestDiscordProvision("hydorah")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries the announcement the same way", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abort())
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const { requestNewGameDiscordAnnounce } = await import("./discordProvision");
    await requestNewGameDiscordAnnounce({ slug: "hydorah", title: "Hydorah", tagline: "A shmup" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

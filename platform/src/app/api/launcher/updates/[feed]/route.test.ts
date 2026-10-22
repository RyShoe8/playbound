import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("launcher update feeds", () => {
  it.each(["latest.yml", "admin.yml"])('%s resolves without a database connection', async (feed) => {
    const response = await GET(new Request(`https://playbound.club/api/launcher/updates/${feed}`), {
      params: Promise.resolve({ feed }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/${feed}`
    );
  });
});

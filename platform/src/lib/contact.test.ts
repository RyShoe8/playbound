import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "./contact";

describe("contact address", () => {
  it("is the team inbox, and the mailto link points at it", () => {
    expect(CONTACT_EMAIL).toBe("theteam@playbound.club");
    expect(CONTACT_MAILTO).toBe("mailto:theteam@playbound.club");
  });
});

describe("sendMail", () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = "key";
    delete process.env.MAIL_FROM_EMAIL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
  });

  it("does not send from the receive-only team address, and sets reply-to when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await import("./mailer");
    await sendMail(CONTACT_EMAIL, "Subject", "<p>hi</p>", { replyTo: "someone@example.org" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sender.email).not.toBe(CONTACT_EMAIL);
    expect(body.sender.email).toBe("playboundclub@gmail.com");
    expect(body.to).toEqual([{ email: CONTACT_EMAIL }]);
    expect(body.replyTo).toEqual({ email: "someone@example.org" });
  });

  it("leaves reply-to off when there is none", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendMail } = await import("./mailer");
    await sendMail("a@b.co", "Subject", "<p>hi</p>");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("replyTo");
  });
});

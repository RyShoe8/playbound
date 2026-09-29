import { NextResponse } from "next/server";
import { z } from "zod";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { prepareBasicCheckout } from "@/lib/dedicatedHosting/checkout";

const checkoutSchema = z.object({
  regionKey: z.string().regex(/^[a-z0-9-]{2,40}$/),
  slots: z.number().int().min(1).max(512),
  checkoutKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
});

/** Prepared for the billing rollout; salesEnabled remains admin-locked off. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  try {
    return NextResponse.json(await prepareBasicCheckout({ userId, ...parsed.data }), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout unavailable";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

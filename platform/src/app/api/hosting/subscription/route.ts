import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { setCustomerCancellation } from "@/lib/dedicatedHosting/customerBilling";

export async function PATCH(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.cancelAtPeriodEnd !== "boolean") return NextResponse.json({ error: "Invalid cancellation request" }, { status: 400 });
  try {
    const result = await setCustomerCancellation(userId, body.cancelAtPeriodEnd);
    return NextResponse.json("error" in result ? { error: result.error } : result, { status: result.status });
  } catch (error) {
    console.error("[dedicated-hosting] customer cancellation failed:", error);
    return NextResponse.json({ error: "Billing could not be updated. Please try again or contact hosting support." }, { status: 503 });
  }
}

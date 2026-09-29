import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { scheduleCustomerDowngrade, setCustomerCancellation, upgradeCustomerPlan } from "@/lib/dedicatedHosting/customerBilling";

export async function PUT(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Number.isSafeInteger(body?.slots)) return NextResponse.json({ error: "Invalid slot package" }, { status: 400 });
  try {
    const result = await scheduleCustomerDowngrade(userId, body.slots);
    return NextResponse.json("error" in result ? { error: result.error } : result, { status: result.status });
  } catch (error) {
    console.error("[dedicated-hosting] customer downgrade scheduling failed:", error);
    return NextResponse.json({ error: "The plan change is being reconciled. Your current plan remains billed until Stripe confirms the schedule. Contact hosting support if it remains pending." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Number.isSafeInteger(body?.slots)) return NextResponse.json({ error: "Invalid slot package" }, { status: 400 });
  try {
    const result = await upgradeCustomerPlan(userId, body.slots);
    return NextResponse.json("error" in result ? { error: result.error } : result, { status: result.status });
  } catch (error) {
    console.error("[dedicated-hosting] customer upgrade failed:", error);
    return NextResponse.json({ error: "Upgrade could not be completed. If payment succeeded, your slots are reserved while billing reconciles. Contact hosting support if it remains pending." }, { status: 503 });
  }
}

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

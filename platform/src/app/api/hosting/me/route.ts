import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getTier } from "@/lib/dedicatedHosting/tier";
import { currentSubscription, listCustomerServers, offeredGames } from "@/lib/dedicatedHosting/servers";
import { customerServerView } from "@/lib/dedicatedHosting/view";
import { sharedServers } from "@/lib/dedicatedHosting/servers";

/** GET /api/hosting/me — the signed-in customer's PlayBound Dedicated plan and saved servers. */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [sub, shared] = await Promise.all([currentSubscription(userId), sharedServers(userId)]);
  const sharedView = shared.map((s) => ({ ...customerServerView(s as Record<string, unknown>), role: s.role }));
  if (!sub) return NextResponse.json({ subscription: null, servers: [], shared: sharedView }, { headers: { "cache-control": "no-store" } });
  const tier = await getTier(sub.tier);
  const [servers, games] = await Promise.all([listCustomerServers(String(sub._id)), offeredGames(tier, sub.regionKey)]);
  const region = tier.regions.find((r) => r.key === sub.regionKey);
  return NextResponse.json(
    {
      subscription: {
        id: String(sub._id),
        tierName: tier.name,
        regionKey: sub.regionKey,
        regionLabel: region?.label || sub.regionKey,
        slotCapacity: sub.slotCapacity,
        allocatedSlots: sub.allocatedSlots,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodEnd: sub.currentPeriodEnd,
      },
      limits: { maxSavedServers: tier.maxSavedServers, startsDisabled: tier.startsDisabled },
      games,
      servers: servers.map(customerServerView),
      shared: sharedView,
    },
    { headers: { "cache-control": "no-store" } }
  );
}

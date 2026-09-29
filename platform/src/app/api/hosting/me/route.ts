import { NextResponse } from "next/server";
import { getFriendsUserId } from "@/lib/friendsAuth";
import { getTier } from "@/lib/dedicatedHosting/tier";
import { currentSubscription, listCustomerServers, offeredGames } from "@/lib/dedicatedHosting/servers";
import { customerServerView } from "@/lib/dedicatedHosting/view";
import { sharedServers } from "@/lib/dedicatedHosting/servers";
import DedicatedCapacityHold from "@/lib/models/DedicatedCapacityHold";

/** GET /api/hosting/me — the signed-in customer's PlayBound Dedicated plan and saved servers. */
export async function GET(req: Request) {
  const userId = await getFriendsUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [sub, shared] = await Promise.all([currentSubscription(userId), sharedServers(userId)]);
  const sharedView = shared.map((s) => ({ ...customerServerView(s as Record<string, unknown>), role: s.role }));
  if (!sub) return NextResponse.json({ subscription: null, servers: [], shared: sharedView }, { headers: { "cache-control": "no-store" } });
  const tier = await getTier(sub.tier);
  const [servers, games, pendingUpgrade] = await Promise.all([
    listCustomerServers(String(sub._id)), offeredGames(tier, sub.regionKey),
    DedicatedCapacityHold.findOne({ planChangeSubscriptionId: sub._id, state: "held" }).select({ toSlots: 1 }).lean(),
  ]);
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
        source: sub.source,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodEnd: sub.currentPeriodEnd,
        scheduledChange: sub.scheduledChange ? { targetSlots: sub.scheduledChange.targetSlots, effectiveAt: sub.scheduledChange.effectiveAt, state: sub.scheduledChange.state } : null,
      },
      limits: { maxSavedServers: tier.maxSavedServers, startsDisabled: tier.startsDisabled },
      packages: tier.packages.filter((p) => p.enabled && p.stripePriceId).map((p) => ({ slots: p.slots, priceCents: p.priceCents, currency: p.currency })),
      pendingUpgradeSlots: pendingUpgrade?.toSlots || null,
      games,
      servers: servers.map(customerServerView),
      shared: sharedView,
    },
    { headers: { "cache-control": "no-store" } }
  );
}

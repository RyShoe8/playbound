import type { Metadata } from "next";
import { HostingDashboard } from "@/components/hosting/HostingDashboard";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { currentSubscription } from "@/lib/dedicatedHosting/servers";
import { RUNNABLE_STATUSES } from "@/lib/dedicatedHosting/entitlement";
import HostingPage from "../page";

export const metadata: Metadata = {
  title: "My Servers — PlayBound Dedicated",
  robots: { index: false },
};

export default async function HostingServersPage() {
  const session = await getServerSession(authOptions);
  const subscription = session?.user?.id ? await currentSubscription(session.user.id) : null;
  if (!subscription || !(RUNNABLE_STATUSES as readonly string[]).includes(subscription.status)) {
    return <HostingPage />;
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <HostingDashboard />
    </div>
  );
}

import { HostingTierDetails } from "@/components/hosting/HostingTierDetails";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Pro Game Hosting", description: "The PlayBound Dedicated Pro game lineup and upcoming features.", path: "/hosting/pro" });

export default function HostingProPage() {
  return <HostingTierDetails tierKey="pro" />;
}

import { HostingTierDetails } from "@/components/hosting/HostingTierDetails";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Extreme Game Hosting", description: "The PlayBound Dedicated Extreme game lineup and upcoming features.", path: "/hosting/extreme" });

export default function HostingExtremePage() {
  return <HostingTierDetails tierKey="extreme" />;
}

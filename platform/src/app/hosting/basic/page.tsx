import { HostingTierDetails } from "@/components/hosting/HostingTierDetails";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "Basic Game Hosting", description: "Every game, edition and feature in PlayBound Dedicated Basic.", path: "/hosting/basic" });

export default function HostingBasicPage() {
  return <HostingTierDetails tierKey="basic" />;
}

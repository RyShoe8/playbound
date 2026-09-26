import type { Metadata } from "next";
import { ServerControl } from "@/components/hosting/ServerControl";

export const metadata: Metadata = {
  title: "Server Control — PlayBound Dedicated",
  robots: { index: false },
};

export default async function ServerControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <ServerControl serverId={id} />
    </div>
  );
}

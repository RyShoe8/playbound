import type { Metadata } from "next";
import { LookingToPartyView } from "@/components/friends/LookingToPartyView";
import { privateMetadata } from "@/lib/seo";

/*
 * Not indexed. The list is whoever is online this minute, so there is no
 * stable content for a result to point at — by the time anyone clicked
 * through from search the page would describe a different set of people.
 */
export const metadata: Metadata = privateMetadata("Looking to Party");

export default function LookingToPartyPage() {
  return (
    <div className="w-full space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <LookingToPartyView />
    </div>
  );
}

import type { Metadata } from "next";
import { LookingToPartyView } from "@/components/friends/LookingToPartyView";

export const metadata: Metadata = {
  title: "Looking to Party",
  description: "Players who want a game right now, and what they have installed.",
};

export default function LookingToPartyPage() {
  return (
    <div className="w-full space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <LookingToPartyView />
    </div>
  );
}

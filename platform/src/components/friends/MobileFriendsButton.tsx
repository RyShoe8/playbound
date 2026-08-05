"use client";

import { useSession } from "next-auth/react";
import { useFriendsStore } from "@/stores/friendsStore";
import { Users } from "lucide-react";

export function MobileFriendsButton() {
  const { status } = useSession();
  const { incomingRequests, setMobilePanelOpen } = useFriendsStore();

  if (status !== "authenticated") return null;

  return (
    <button 
      onClick={() => setMobilePanelOpen(true)}
      className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary xl:hidden relative"
    >
      <Users className="size-5" />
      {incomingRequests.length > 0 && (
        <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
          {incomingRequests.length}
        </span>
      )}
    </button>
  );
}

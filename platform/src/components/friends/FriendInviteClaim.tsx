"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "playbound_friend_invite_token";

/** Persist invite token from signup URL for later claim after verify/login. */
export function storeInviteTokenFromSearch(search: string) {
  try {
    const params = new URLSearchParams(search);
    const token = params.get("invite");
    if (token && token.length >= 16) {
      sessionStorage.setItem(STORAGE_KEY, token);
    }
    const email = params.get("email");
    return { token, email };
  } catch {
    return { token: null, email: null };
  }
}

/** After auth, redeem any stored invite token (and email-based pending invites). */
export function FriendInviteClaim() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!token) return;

    void fetch("/api/friends/invite/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(() => {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [status]);

  return null;
}

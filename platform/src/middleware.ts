import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Holds OAuth signups on /welcome until they choose a PlayBound username.
 *
 * Enforced in middleware rather than per-page so there is no route that
 * forgets the check. Without it a Google signup could post a review under the
 * `pb_<hex>` placeholder, which would then be visible forever.
 */

/** Reachable while the gate is up. Everything else redirects to /welcome. */
const ALLOWED_PREFIXES = [
  "/welcome",
  "/api/auth", // NextAuth endpoints + the username claim route
  "/about",
  "/privacy",
  "/terms",
];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.needsUsername) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/welcome";
  url.search = "";
  // Send them back where they were headed once the username is claimed.
  const target = `${pathname}${search}`;
  if (target && target !== "/") url.searchParams.set("next", target);
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Skip Next internals, static assets and files with extensions. The matcher
   * does the cheap filtering so getToken only runs on real page requests.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|llms.txt|.*\\..*).*)"],
};

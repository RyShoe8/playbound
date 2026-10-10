"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, Gamepad2, Puzzle, Swords, CalendarDays, Users, LibraryBig, BadgePercent, MessageSquare, Server, Code, Shield, Search } from "lucide-react";
import { canViewAdmin } from "@/lib/adminAccess";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { SignOutButton } from "@/components/SignOutButton";
import { DiscoveryModeToggle } from "@/components/DiscoveryModeToggle";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";
import { openDiscordInvite } from "@/lib/openPlayboundDeepLink";
import { SITE_DISCORD_INVITE } from "@/lib/site";
const links = [["/", "Home", Home], ["/discover", "Games", Gamepad2], ["/mods", "Mods", Puzzle], ["/multiplayer", "Multiplayer", Swords], ["/events", "Events", CalendarDays], ["/friends", "Friends", Users], ["/library", "Library", LibraryBig], ["/deals", "Game deals", BadgePercent], ["/feedback", "Feedback", MessageSquare]] as const;
export function NewSiteShell() {
 const pathname = usePathname().replace(/^\/new(?=\/|$)/, "") || "/";
 const {data:session}=useSession();
 const name=session?.user?.username || session?.user?.name || "Your account";
 const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
 const nav=(href:string,label:string,Icon:typeof Home)=><Link key={href} href={`/new${href==="/"?"":href}`} aria-current={(href==="/"?pathname==="/":pathname.startsWith(href))?"page":undefined}><Icon size={17}/><span>{label}</span></Link>;
 return <div className="new-site-shell">
 <aside className="new-sidebar">
 <Link className="new-wordmark" href="/new"><span><i>▶</i>play<b>bound.</b></span><small>Discover. Play. Connect.</small></Link>
 <nav aria-label="Main navigation">{links.map(([href,label,Icon])=>nav(href,label,Icon))}</nav>
 <p className="new-nav-label">Your workspace</p><nav aria-label="Workspace">{nav("/hosting/servers","My servers",Server)}{nav("/developer","Developer tools",Code)}{canViewAdmin(session?.user?.role)&&nav("/admin","Administration",Shield)}</nav>
 <details className="new-sidebar-preferences"><summary>Discovery & compatibility</summary><DiscoveryModeToggle variant="sidebar"/><GameCompatibilityToggle variant="sidebar"/></details>
 <button className="new-discord" onClick={()=>openDiscordInvite(SITE_DISCORD_INVITE)}>Join Discord ↗</button>
 <div className="new-account">{session?.user?<><Link href="/new/profile" className="new-account-profile"><span className="new-avatar">{initials}</span><span>{name}<small>Profile & PC</small></span></Link><details><summary aria-label="Account menu">•••</summary><div><Link href="/new/profile">Account settings</Link><SignOutButton/></div></details></>:<Link href="/login?callbackUrl=/new">Sign in to PlayBound →</Link>}</div>
 </aside>
 <header className="new-topbar"><form action="/new/search" role="search"><Search size={17}/><input name="q" type="search" aria-label="Search games and developers" placeholder="Find your next game"/></form><div>{session?.user?<><NotificationBell/><Link href="/new/profile" className="new-avatar" aria-label="Your profile">{initials}</Link></>:<Link href="/login?callbackUrl=/new">Sign in</Link>}</div></header>
 </div>;
}

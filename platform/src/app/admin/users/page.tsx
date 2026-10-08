import type { Metadata } from "next";
import { connection } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserActions, type AdminUserRow } from "@/components/admin/UserActions";
import { LocalTime } from "@/components/LocalTime";
import { signupMethodLabel } from "@/lib/admin/signupMethod";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const session = await getServerSession(authOptions);
  await dbConnect();
  const users = await User.find()
    .select("username email role tester emailVerified disabled createdAt authProviders signupMethod +password")
    .sort({ createdAt: -1 })
    .lean();

  const rows: AdminUserRow[] = users.map((u) => ({
    id: String(u._id),
    username: u.username,
    email: u.email,
    role: u.role as AdminUserRow["role"],
    tester: Boolean(u.tester),
    emailVerified: Boolean(u.emailVerified),
    signupMethod: signupMethodLabel({
      signupMethod: u.signupMethod,
      authProviders: u.authProviders,
      hasPassword: Boolean(u.password),
    }),
    disabled: Boolean(u.disabled),
    createdAt: new Date(u.createdAt).toISOString(),
  }));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Users</h1>
        <p className="mt-1 text-muted-foreground">
          {session?.user?.role === "admin"
            ? "Manage Admin and Admin Viewer access, tester status, and accounts. Founder and your own account are protected."
            : "View account access and status. Only Admins can make changes."}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Signup</th>
              <th className="px-4 py-3 font-semibold">Verified</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-border bg-card last:border-0 align-top">
                <td className="px-4 py-2.5">
                  <p className="font-semibold">{u.username}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-4 py-2.5">
                  {u.role === "admin" ? "Admin" : u.role === "admin_viewer" ? "Admin Viewer" : u.role === "developer" ? "Developer" : u.tester ? "Tester" : "User"}
                </td>
                <td className="px-4 py-2.5" title={u.signupMethod === "Unknown" ? "Original method cannot be determined for this older account" : undefined}>
                  {u.signupMethod}
                </td>
                <td className="px-4 py-2.5">{u.emailVerified ? "Yes" : "No"}</td>
                <td className="px-4 py-2.5">{u.disabled ? "Disabled" : "Active"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  <LocalTime
                    mode="date"
                    value={u.createdAt ? new Date(u.createdAt).toISOString() : null}
                  />
                </td>
                <td className="px-4 py-2.5">
                  {session?.user?.role === "admin" ? <UserActions user={u} currentUserId={session.user.id} /> : <span className="text-muted-foreground">Read only</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

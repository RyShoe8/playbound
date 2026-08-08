import type { Metadata } from "next";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UserActions, type AdminUserRow } from "@/components/admin/UserActions";
import { LocalTime } from "@/components/LocalTime";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  await dbConnect();
  const users = await User.find()
    .select("username email role tester emailVerified disabled createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const rows: AdminUserRow[] = users.map((u) => ({
    id: String(u._id),
    username: u.username,
    email: u.email,
    role: u.role as "user" | "admin",
    tester: Boolean(u.tester),
    emailVerified: Boolean(u.emailVerified),
    disabled: Boolean(u.disabled),
    createdAt: new Date(u.createdAt).toISOString(),
  }));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Users</h1>
        <p className="mt-1 text-muted-foreground">
          Promote or demote admins, grant tester access, disable login, or permanently delete accounts. Founder and your
          own account are protected.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
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
                  {u.role === "admin" ? "admin" : u.tester ? "Tester" : "user"}
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
                  <UserActions user={u} currentUserId={session?.user?.id ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

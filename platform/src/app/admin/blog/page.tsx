import type { Metadata } from "next";
import { connection } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canWriteAdmin } from "@/lib/adminAccess";
import { listAdminBlogPosts } from "@/lib/blog";
import { BlogManager } from "@/components/admin/BlogManager";

export const metadata: Metadata = { title: "Admin · Blog" };

export default async function AdminBlogPage() {
  await connection();
  const session = await getServerSession(authOptions);
  const posts = await listAdminBlogPosts();
  return <BlogManager initialPosts={posts} canEdit={canWriteAdmin(session?.user?.role)} />;
}

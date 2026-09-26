import { redirect } from "next/navigation";

export default async function AdminBugsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/admin/feedback${qs ? `?${qs}` : ""}`);
}

import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "servers");
  for (const [key, val] of Object.entries(sp || {})) {
    if (key === "tab") continue;
    if (typeof val === "string") {
      params.set(key, val);
    } else if (Array.isArray(val)) {
      val.forEach((v) => params.append(key, v));
    }
  }
  const qs = params.toString();
  redirect(`/multiplayer?${qs}`);
}


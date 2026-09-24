import { ControllerClient } from "@/components/couch/ControllerClient";
import { connection } from "next/server";

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams?: Promise<{ view?: string }>;
}

export default async function ControllerJoinPage({ params, searchParams }: PageProps) {
  // Per-request by nature: live data, the signed-in viewer, or both.
  // Reads the database before it reads anything request-scoped, which
  // Cache Components will not allow during a prerender.
  await connection();
  const { code } = await params;
  const q = searchParams ? await searchParams : {};
  const layout = q.view === "game" ? "game" : "default";
  return <ControllerClient code={String(code || "").toUpperCase()} layout={layout} />;
}

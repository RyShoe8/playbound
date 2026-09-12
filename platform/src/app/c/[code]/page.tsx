import { ControllerClient } from "@/components/couch/ControllerClient";
import { connection } from "next/server";

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ view?: string }>;
}

export default async function CouchJoinByCodePage({ params, searchParams }: PageProps) {
  await connection();
  const { code } = await params;
  const q = await searchParams;
  const layout = q.view === "game" ? "game" : "default";
  return <ControllerClient code={String(code || "").toUpperCase()} layout={layout} />;
}

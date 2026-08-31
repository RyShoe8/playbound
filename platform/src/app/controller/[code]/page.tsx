import { ControllerClient } from "@/components/couch/ControllerClient";
import { connection } from "next/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ControllerJoinPage({ params }: PageProps) {
  // Per-request by nature: live data, the signed-in viewer, or both.
  // Reads the database before it reads anything request-scoped, which
  // Cache Components will not allow during a prerender.
  await connection();
  const { code } = await params;
  return <ControllerClient code={String(code || "").toUpperCase()} />;
}

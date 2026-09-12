import { ControllerClient } from "@/components/couch/ControllerClient";
import { connection } from "next/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function CouchJoinByCodePage({ params }: PageProps) {
  await connection();
  const { code } = await params;
  return <ControllerClient code={String(code || "").toUpperCase()} />;
}

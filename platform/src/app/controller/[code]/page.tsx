import { ControllerClient } from "@/components/couch/ControllerClient";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ControllerJoinPage({ params }: PageProps) {
  const { code } = await params;
  return <ControllerClient code={String(code || "").toUpperCase()} />;
}

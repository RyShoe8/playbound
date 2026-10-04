import { connection } from "next/server";
import { MixtapeEditor } from "@/components/admin/MixtapeEditor";
export default async function Page() {
  await connection();
  return <MixtapeEditor />;
}

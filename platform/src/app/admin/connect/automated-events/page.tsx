import { redirect } from "next/navigation";

export default function LegacyPlannerRedirect() {
  redirect("/admin/events#legacy-planner");
}

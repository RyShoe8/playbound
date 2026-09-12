import { redirect } from "next/navigation";

/** Legacy landing — short entry is /c. */
export default function ControllerLandingPage() {
  redirect("/c");
}

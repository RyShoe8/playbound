import { redirect } from "next/navigation";

export default function CollectionsIndexRedirect() {
  redirect("/discover#collections");
}

import { permanentRedirect } from "next/navigation";

/** Basic is the only plan on sale, and /hosting is its page. */
export default function HostingBasicPage() {
  permanentRedirect("/hosting");
}

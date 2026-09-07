import { permanentRedirect } from "next/navigation";

/**
 * Party limits moved in with the parties they govern.
 *
 * Kept as a redirect rather than deleted: this URL was live, and a bookmark or
 * a link in a message should land somewhere useful rather than 404.
 */
export default function AdminPlatformLimitsRedirect(): never {
  permanentRedirect("/admin/connect/parties");
}

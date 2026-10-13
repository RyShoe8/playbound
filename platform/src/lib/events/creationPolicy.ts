import { canWriteAdmin } from "@/lib/adminAccess";
import type { z } from "zod";
import type { eventCreateSchema } from "./service";

/** Public creators cannot label their own events as official or featured. */
export function eventCreationPolicy(body: z.infer<typeof eventCreateSchema>, role?: string | null) {
  return canWriteAdmin(role) ? body : { ...body, hostType: "community" as const, featured: false };
}

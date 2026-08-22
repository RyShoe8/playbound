import dbConnect from "@/lib/db";
import { setCouchStoreMode } from "@/lib/couch/sessionManager";

/** Connect Mongo and prefer durable couch session store. */
export async function ensureCouchStore() {
  await dbConnect();
  setCouchStoreMode("mongo");
}

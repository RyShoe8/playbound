import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import dbConnect from "@/lib/db";
import FlightDeviceProfile from "@/lib/models/FlightDeviceProfile";
import { normalizeFlightProfile } from "@/lib/flightDeviceProfile";
import { checkRateLimit } from "@/lib/discussion/rateLimit";
import { clientIpFrom } from "@/lib/recaptcha";

/**
 * GET: approved flight-device profiles, for every launcher to merge over the
 * ones it ships — a newly measured device goes live without a launcher
 * release. POST: a player's calibration, held for review.
 */
export async function GET() {
  try {
    await dbConnect();
    const rows = await FlightDeviceProfile.find({ status: "approved" }).select("profile").lean<{ profile: unknown }[]>();
    const profiles = rows.map((r) => normalizeFlightProfile(r.profile)).filter(Boolean);
    return NextResponse.json(
      { profiles },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    unstable_rethrow(err);
    console.error("device-profiles GET:", err);
    return NextResponse.json({ profiles: [] }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFrom(req) || "unknown";
    await dbConnect();
    const limit = await checkRateLimit(`device-profile:ip:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.ok) return NextResponse.json({ error: "Too many submissions" }, { status: 429 });

    const body = (await req.json().catch(() => null)) as { profile?: unknown } | null;
    const profile = normalizeFlightProfile(body?.profile);
    if (!profile) return NextResponse.json({ error: "Not a usable device profile" }, { status: 400 });

    // An approved profile is not replaced by a single new calibration; it still
    // counts, so an admin can see agreement or a reason to look again.
    const existing = await FlightDeviceProfile.findOne({ vidPid: profile.vidPid }).select("status").lean<{ status?: string }>();
    const update =
      existing?.status === "approved"
        ? { $inc: { submissions: 1 }, $set: { lastSubmittedAt: new Date() } }
        : {
            $inc: { submissions: 1 },
            $set: { profile, label: profile.label, status: "pending", lastSubmittedAt: new Date() },
          };
    await FlightDeviceProfile.updateOne({ vidPid: profile.vidPid }, update, { upsert: true });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err) {
    unstable_rethrow(err);
    console.error("device-profiles POST:", err);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}

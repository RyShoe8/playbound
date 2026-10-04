import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminSession, requireAdminViewSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import { MixtapeTrack, MixtapeSettings, MixtapeProfile } from "@/lib/models/Mixtape";
import User from "@/lib/models/User";
import { httpsUrl, starterPack } from "@/lib/mixtape/rules";
export async function GET() {
  const { error } = await requireAdminViewSession(); if (error) return error;
  await dbConnect();
  const [tracks, settings, players, holdings] = await Promise.all([
    MixtapeTrack.find().sort({ title: 1 }).lean(), MixtapeSettings.findOne({ key: "hyperdisc-arena" }).lean(),
    MixtapeProfile.countDocuments(), MixtapeProfile.aggregate([{ $unwind: "$inventory" }, { $group: { _id: "$inventory", count: { $sum: 1 } } }]),
  ]);
  return NextResponse.json({ tracks, settings, stats: { players, holdings } });
}
export async function POST(req: Request) {
  const { error } = await requireAdminSession(); if (error) return error;
  try {
    const b = await req.json();
    if (b.action === "reset-tester") {
      const user = await User.findOne({ username: String(b.username || ""), tester: true }).select("_id").lean();
      if (!user) throw new Error("Choose an account marked as a tester");
      const tracks = await MixtapeTrack.find({ enabled: true }).lean();
      const ids = starterPack(tracks.map(t => ({ id: t.tapeId, starter: t.starter, enabled: t.enabled })));
      const userId = String(user._id);
      const old = await MixtapeProfile.findOne({ userId }).lean();
      const history = old ? [{ at: new Date(), inventory: old.inventory, deck: old.deck, acquisitions: old.acquisitions }] : [];
      await MixtapeProfile.updateOne({ userId }, { $set: { inventory: ids, deck: ids.slice(0, 6), acquisitions: ids.map(trackId => ({ trackId, source: "starter_pack", at: new Date() })) }, $push: { resetHistory: { $each: history, $slice: -20 } } }, { upsert: true });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "menu") {
      if (b.tapeId && !(await MixtapeTrack.exists({ tapeId: b.tapeId, enabled: true }))) throw new Error("Select an available tape");
      await MixtapeSettings.updateOne({ key: "hyperdisc-arena" }, { $set: { menuTapeId: String(b.tapeId || "") } }, { upsert: true });
      return NextResponse.json({ ok: true });
    }
    const text = (key: string, max = 200) => String(b[key] || "").trim().slice(0, max);
    if (!text("title") || !text("artist") || !b.audioUrl) throw new Error("Title, artist, and audio are required");
    if (!/\.(ogg|mp3|wav)$/i.test(new URL(httpsUrl(b.audioUrl)).pathname)) throw new Error("Audio URL must point to an OGG, MP3, or WAV file");
    if (b.coverUrl && !/\.(png|jpe?g)$/i.test(new URL(httpsUrl(b.coverUrl)).pathname)) throw new Error("Cover URL must point to a PNG or JPG file");
    const tapeId = b.tapeId || crypto.randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tapeId)) throw new Error("Invalid tape ID");
    const discountPercent = b.discountPercent ? Number(b.discountPercent) : null;
    if (discountPercent !== null && (!Number.isInteger(discountPercent) || discountPercent < 10 || discountPercent > 20)) throw new Error("Discount must be 10–20 percent");
    const year = b.year ? Number(b.year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200)) throw new Error("Invalid release year");
    const track = await MixtapeTrack.findOneAndUpdate({ tapeId }, { $set: {
      title: text("title"), artist: text("artist"), album: text("album"), genre: text("genre", 80), bio: text("bio", 1500), year,
      audioUrl: httpsUrl(b.audioUrl), coverUrl: httpsUrl(b.coverUrl), website: httpsUrl(b.website), bandcamp: httpsUrl(b.bandcamp), spotify: httpsUrl(b.spotify),
      discountCode: text("discountCode", 100), discountPercent, starter: b.starter === true, enabled: b.enabled !== false,
    } }, { upsert: true, returnDocument: "after", runValidators: true }).lean();
    return NextResponse.json({ track });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 400 }); }
}

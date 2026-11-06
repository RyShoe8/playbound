import dbConnect from "@/lib/db";
import GameSubmission from "@/lib/models/GameSubmission";

export async function readSubmissionDraft(id: string | undefined, kind: "edition" | "mod", baseGameSlug: string) {
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
  await dbConnect();
  return GameSubmission.findOne({ _id: id, kind, baseGameSlug, status: "approved" })
    .select("title description website githubRepo license")
    .lean<{ title: string; description: string; website: string; githubRepo?: string; license?: string }>();
}

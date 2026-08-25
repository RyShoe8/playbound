import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import {
  evaluateAndTriggerAutomatedEvent,
  stopAutomatedEvent,
  sendSilentDiscordAnnouncement,
  getAutomatedEventConfig,
} from "@/lib/events/automatedEventPlannerService";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    action?: "trigger" | "stop" | "test_discord";
    gameSlug?: string;
    editionSlug?: string;
  };

  if (body.action === "stop") {
    const result = await stopAutomatedEvent("force_stopped");
    return NextResponse.json(result);
  }

  if (body.action === "test_discord") {
    const config = await getAutomatedEventConfig();
    const result = await sendSilentDiscordAnnouncement({
      webhookUrl: config.discord?.webhookUrl,
      gameSlug: body.gameSlug || "openra",
      editionSlug: body.editionSlug || null,
      gameTitle: "OpenRA (Test Preview)",
      host: "127.0.0.1",
      port: 1234,
      durationHours: 2,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 2 * 3600 * 1000),
      customTitle: config.discord?.customTitle,
      customMessage: config.discord?.customMessage,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  // Default action: trigger automated event planner
  const result = await evaluateAndTriggerAutomatedEvent({
    force: true,
    gameSlugOverride: body.gameSlug,
    editionSlugOverride: body.editionSlug,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

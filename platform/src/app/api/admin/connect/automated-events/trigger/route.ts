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
    testDiscordOnly?: boolean;
    gameSlug?: string;
    gameSlugOverride?: string;
    editionSlug?: string;
    editionSlugOverride?: string;
    leadMinutesOverride?: number;
  };

  if (body.action === "stop") {
    const result = await stopAutomatedEvent("force_stopped");
    return NextResponse.json(result);
  }

  if (body.action === "test_discord" || body.testDiscordOnly) {
    const config = await getAutomatedEventConfig();
    const result = await sendSilentDiscordAnnouncement({
      webhookUrl: config.discord?.webhookUrl,
      gameSlug: body.gameSlug || body.gameSlugOverride || "openra",
      editionSlug: body.editionSlug || body.editionSlugOverride || null,
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
    gameSlugOverride: body.gameSlugOverride || body.gameSlug,
    editionSlugOverride: body.editionSlugOverride || body.editionSlug,
    leadMinutesOverride: body.leadMinutesOverride,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const result = await stopAutomatedEvent("force_stopped");
  return NextResponse.json(result);
}

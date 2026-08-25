import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { cronAuthorized } from "@/lib/cronAuth";
import {
  checkAndTeardownExpiredEvents,
  evaluateAndTriggerAutomatedEvent,
} from "@/lib/events/automatedEventPlannerService";

export const maxDuration = 60;

async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  // 1. Teardown any expired servers
  const teardownResult = await checkAndTeardownExpiredEvents();

  // 2. Evaluate if a new automated pop-up event should be triggered
  const triggerResult = await evaluateAndTriggerAutomatedEvent({ force: false });

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    teardown: teardownResult,
    trigger: triggerResult,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

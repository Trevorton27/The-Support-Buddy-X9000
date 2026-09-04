import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSlackAdapter } from "@/lib/integrations/slack";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slack = getSlackAdapter();
  const ok = await slack.send({
    text: `The Support Buddy X9000 — test message from ${slack.isLive ? "live" : "mock"} adapter`,
  });

  return NextResponse.json({ ok, mode: slack.isLive ? "live" : "mock" });
}

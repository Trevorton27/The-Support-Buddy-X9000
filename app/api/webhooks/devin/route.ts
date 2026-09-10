import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyDevinSignature, processDevinWebhook } from "@/lib/webhooks/devin";

const logger = createLogger("api-webhook-devin");

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-devin-signature");

  // Verify signature if secret is configured
  const secret = process.env.DEVIN_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyDevinSignature(body, signature, secret)) {
      logger.warn("Devin webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = payload.session_id as string | undefined;
  const eventType = payload.event_type as string | undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  logger.info("Devin webhook received", { eventType, sessionId });

  try {
    const result = await processDevinWebhook(payload as unknown as Parameters<typeof processDevinWebhook>[0]);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("Devin webhook processing failed", {
      sessionId,
      eventType,
      error: String(err),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { verifyGitHubSignature, processGitHubEvent } from "@/lib/webhooks/github";

const logger = createLogger("api-webhook-github");

export async function POST(request: Request) {
  const body = await request.text();
  const eventType = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");
  const deliveryId = request.headers.get("x-github-delivery");

  if (!eventType) {
    return NextResponse.json({ error: "Missing x-github-event header" }, { status: 400 });
  }

  // Verify signature if secret is configured
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    if (!verifyGitHubSignature(body, signature, secret)) {
      logger.warn("GitHub webhook signature verification failed", { deliveryId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("GitHub webhook received", { eventType, deliveryId });

  try {
    const result = await processGitHubEvent(eventType, payload);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("GitHub webhook processing failed", {
      eventType,
      deliveryId,
      error: String(err),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

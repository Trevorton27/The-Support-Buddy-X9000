import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAuth } from "@/lib/auth";
import { dispatchDefectAuthor, getDefectClasses } from "@/lib/demo-lab/defect-author";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api-defect-author");

const dispatchSchema = z.object({
  service: z.string().min(1),
  defectClass: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  allowedPaths: z.array(z.string()).optional(),
  guidance: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await dispatchDefectAuthor(
      parsed.data,
      userId!,
      orgId ?? ""
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    logger.error("Defect author dispatch failed", { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { response } = await requireOrgAuth();
  if (response) return response;

  return NextResponse.json({
    defectClasses: getDefectClasses(),
    services: [
      "auth-service",
      "webhook-dispatcher",
      "order-service",
      "billing-service",
      "rate-limiter",
      "database-client",
    ],
    difficulties: ["easy", "medium", "hard"],
  });
}

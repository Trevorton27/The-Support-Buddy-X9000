import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createExampleSchema = z.object({
  ticketTitle: z.string().min(1),
  ticketDescription: z.string().min(1),
  expectedRootCause: z.string().min(1),
  expectedSeverity: z.enum(["critical", "high", "medium", "low"]),
  expectedEvidenceKeywords: z.array(z.string()),
  approvedReply: z.string().min(1),
  sourceRunId: z.string().optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const examples = await prisma.evalExample.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ examples });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createExampleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const example = await prisma.evalExample.create({
    data: {
      ...parsed.data,
      expectedEvidenceKeywords: JSON.parse(JSON.stringify(parsed.data.expectedEvidenceKeywords)),
      evidenceChunks: [],
    },
  });

  return NextResponse.json(example, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runEvalSuite } from "@/lib/eval-runner";
import { z } from "zod";

const createRunSchema = z.object({
  name: z.string().min(1),
  exampleIds: z.array(z.string()).optional(),
  model: z.string().optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runs = await prisma.evalRun.findMany({
    include: { results: true },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const model = parsed.data.model ?? "gpt-4o";

  const run = await prisma.evalRun.create({
    data: {
      name: parsed.data.name,
      triggeredBy: userId,
      status: "running",
      model,
    },
  });

  // Run async — don't await, respond immediately
  runEvalSuite(run.id, parsed.data.exampleIds, model).catch(async (err) => {
    await prisma.evalRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    });
    console.error("Eval run failed:", err);
  });

  return NextResponse.json(run, { status: 202 });
}

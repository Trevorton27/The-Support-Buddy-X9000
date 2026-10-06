import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadApprovalProgress } from "@/lib/approval-progress-server";

// GET — post-decision progress for the investigation page tracker (polled while a stage is active)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { userId, response } = await requireAuth();
  if (response) return response;

  const { runId } = await params;
  const progress = await loadApprovalProgress(runId, userId);
  return NextResponse.json({ progress });
}

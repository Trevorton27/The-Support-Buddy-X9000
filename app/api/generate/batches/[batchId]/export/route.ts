import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { exportBatchAsJson, exportBatchAsCsv, exportBatchAsMarkdown } from "@/lib/generation/dataset-exporter";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { response: authError } = await requireOrgAuth();
  if (authError) return authError;

  const { batchId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  let content: string;
  let contentType: string;
  let ext: string;

  if (format === "csv") {
    content = await exportBatchAsCsv(batchId);
    contentType = "text/csv";
    ext = "csv";
  } else if (format === "markdown") {
    content = await exportBatchAsMarkdown(batchId);
    contentType = "text/markdown";
    ext = "md";
  } else {
    content = await exportBatchAsJson(batchId);
    contentType = "application/json";
    ext = "json";
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="batch-${batchId}.${ext}"`,
    },
  });
}

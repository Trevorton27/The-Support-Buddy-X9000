import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDevinAdapter } from "@/lib/integrations/devin";

export async function POST() {
  const { response } = await requireAuth();
  if (response) return response;

  const adapter = getDevinAdapter();
  const result = await adapter.testConnection();

  return NextResponse.json({ ...result, isLive: adapter.isLive });
}

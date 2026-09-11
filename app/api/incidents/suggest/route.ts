import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { suggestClusters } from "@/lib/incident-clustering";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clusters = await suggestClusters();
  return NextResponse.json({ clusters });
}

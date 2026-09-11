import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { embedText } from "@/lib/embeddings";
import { searchKnowledge } from "@/lib/vector-search";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const embedding = await embedText(query);
  const results = await searchKnowledge(embedding, 5);

  return NextResponse.json(results);
}

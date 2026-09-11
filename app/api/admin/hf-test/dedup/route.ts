import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEnv } from "@/lib/env";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = getEnv().HUGGING_FACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "HUGGING_FACE_API_KEY not set" });
  }

  const sampleTexts = [
    "API returning 500 errors on /v2/orders endpoint",
    "Orders endpoint is intermittently failing with server errors",
    "Database connection timeout when processing payments",
  ];

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: sampleTexts, options: { wait_for_model: true } }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, message: `HF API error ${res.status}: ${text.slice(0, 120)}` });
    }

    const embeddings = (await res.json()) as number[][];
    console.log("[HF admin/dedup] raw embeddings from sentence-transformers/all-MiniLM-L6-v2:", `${embeddings.length} vectors, dim=${embeddings[0]?.length}`);
    if (!Array.isArray(embeddings) || embeddings.length < 2) {
      return NextResponse.json({ ok: false, message: "Unexpected response from HF API" });
    }

    const sim01 = Math.round(cosineSimilarity(embeddings[0], embeddings[1]) * 100) / 100;
    const sim02 = Math.round(cosineSimilarity(embeddings[0], embeddings[2]) * 100) / 100;

    return NextResponse.json({
      ok: true,
      message: `Dedup OK — similar pair similarity: ${sim01}, dissimilar pair: ${sim02} (sentence-transformers/all-MiniLM-L6-v2)`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String(e) });
  }
}

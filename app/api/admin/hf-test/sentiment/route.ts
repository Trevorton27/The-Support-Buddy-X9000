import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getEnv } from "@/lib/env";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = getEnv().HUGGING_FACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "HUGGING_FACE_API_KEY not set" });
  }

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "API is returning 500 errors and customers are unable to complete payments" }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, message: `HF API error ${res.status}: ${text.slice(0, 120)}` });
    }

    const data = (await res.json()) as Array<Array<{ label: string; score: number }>>;
    console.log("[HF admin/sentiment] raw response from distilbert-base-uncased-finetuned-sst-2-english:", JSON.stringify(data));
    const neg = data?.[0]?.find((l) => l.label === "NEGATIVE");
    const urgencyScore = neg ? Math.round(neg.score * 100) / 100 : null;

    return NextResponse.json({
      ok: true,
      message: `Sentiment OK — urgency score: ${urgencyScore} (distilbert-base-uncased-finetuned-sst-2-english)`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String(e) });
  }
}

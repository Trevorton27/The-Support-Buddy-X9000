import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
      "https://api-inference.huggingface.co/models/facebook/bart-large-mnli",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: "Users are unable to log in — SAML assertion is failing with invalid signature error",
          parameters: {
            candidate_labels: ["authentication", "database", "billing", "api", "performance", "webhook", "rate-limiting", "deployment"],
          },
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, message: `HF API error ${res.status}: ${text.slice(0, 120)}` });
    }

    const data = (await res.json()) as { labels: string[]; scores: number[] };
    console.log("[HF admin/classify] raw response from facebook/bart-large-mnli:", JSON.stringify(data));
    const top = data.labels?.[0];
    const score = data.scores?.[0];

    return NextResponse.json({
      ok: true,
      message: `Classification OK — top label: "${top}" (${Math.round((score ?? 0) * 100)}%) via facebook/bart-large-mnli`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: String(e) });
  }
}

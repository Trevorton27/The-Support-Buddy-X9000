import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST /api/knowledge/ingest
// Admin-only: triggers re-ingestion of the knowledge base.
// In production this should be invoked as an Inngest function for long-running work;
// here it shells out to the ingest script via a child process for simplicity.
//
// Authorization: must be org admin (orgRole === "owner" or "admin")
export async function POST() {
  const { userId, orgRole } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (orgRole !== "owner" && orgRole !== "admin") {
    return NextResponse.json({ error: "Forbidden — org admin required" }, { status: 403 });
  }

  // Spawn the ingest script as a background child process.
  // We return immediately and let it run asynchronously.
  const { spawn } = await import("child_process");

  const child = spawn(
    "npx",
    ["dotenv-cli", "-e", ".env.local", "--", "tsx", "scripts/knowledge-ingest.ts"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  return NextResponse.json({
    message: "Knowledge base ingestion started in the background.",
    note: "Check server logs for progress. This may take several minutes.",
  });
}

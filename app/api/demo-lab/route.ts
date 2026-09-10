import { NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { listScenariosWithRuns } from "@/lib/demo-lab/lifecycle";

export async function GET() {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const scenarios = await listScenariosWithRuns(orgId ?? "");
  return NextResponse.json({ scenarios });
}

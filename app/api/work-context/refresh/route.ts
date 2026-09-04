import { NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { refreshWorkContext } from "@/lib/work-context";

export async function POST() {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const context = await refreshWorkContext(userId!, orgId!);

  return NextResponse.json(context);
}

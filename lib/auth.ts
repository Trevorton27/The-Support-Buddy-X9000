import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth as betterAuth } from "@/lib/better-auth";

export async function getSession() {
  const session = await betterAuth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * Drop-in replacement for Clerk's auth() — returns { userId, orgId, orgRole }
 * so existing callsites need zero changes.
 */
export async function auth(): Promise<{
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
}> {
  const session = await getSession();
  if (!session) {
    return { userId: null, orgId: null, orgRole: null };
  }
  const orgId = session.session.activeOrganizationId ?? null;
  let orgRole: string | null = null;
  if (orgId) {
    const activeMember = await betterAuth.api.getFullOrganization({
      headers: await headers(),
      query: { organizationId: orgId },
    }).then((org) =>
      org?.members?.find((m) => m.userId === session.user.id)
    ).catch(() => null);
    orgRole = activeMember?.role ?? null;
  }
  return { userId: session.user.id, orgId, orgRole };
}

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId, response: null };
}

export async function requireOrgAuth() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) {
    return {
      userId: null,
      orgId: null,
      orgRole: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { userId, orgId: orgId ?? "", orgRole, response: null };
}

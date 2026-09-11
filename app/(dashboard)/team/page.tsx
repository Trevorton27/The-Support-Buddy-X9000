import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { auth as betterAuth } from "@/lib/better-auth";
import { headers } from "next/headers";
import { MemberList } from "@/components/team/member-list";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users } from "lucide-react";

export default async function TeamPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  let members: {
    id: string;
    identifier: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string;
    role: string;
    createdAt: number;
  }[] = [];

  if (orgId) {
    try {
      const org = await betterAuth.api.getFullOrganization({
        headers: await headers(),
        query: { organizationId: orgId },
      });
      if (org?.members) {
        members = org.members.map((m) => ({
          id: m.id,
          identifier: m.user.email,
          firstName: m.user.name?.split(" ")[0] ?? null,
          lastName: m.user.name?.split(" ").slice(1).join(" ") || null,
          imageUrl: m.user.image ?? "",
          role: m.role,
          createdAt: new Date(m.createdAt).getTime(),
        }));
      }
    } catch {
      // org fetch failed — show empty list
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-slate-700 dark:text-slate-300" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage organization members and roles
          </p>
        </div>
      </div>

      {!orgId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Organization</CardTitle>
            <CardDescription>
              Create or join an organization to manage team members and access enterprise features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Use the organization switcher in the sidebar to create an organization or accept an invitation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Members ({members.length})</CardTitle>
              <CardDescription>
                Members are managed through your organization settings. Roles control data access and actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <MemberList members={members} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Role Permissions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3 text-sm">
                {[
                  {
                    role: "owner",
                    label: "Owner",
                    color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
                    perms: ["View all data", "Run investigations", "Approve/reject drafts", "Manage integrations", "Invite members"],
                  },
                  {
                    role: "admin",
                    label: "Admin",
                    color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
                    perms: ["View all data", "Run investigations", "Approve/reject drafts", "Manage integrations", "Invite members"],
                  },
                  {
                    role: "member",
                    label: "Member",
                    color: "bg-blue-50 text-blue-700 border-blue-200",
                    perms: ["View all data", "Run investigations", "Approve/reject drafts"],
                  },
                ].map(({ role, label, color, perms }) => (
                  <div key={role} className="flex items-start gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 mt-0.5 ${color}`}>
                      {label}
                    </span>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {perms.join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

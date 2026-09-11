import { Badge } from "@/components/ui/badge";

interface OrgMember {
  id: string;
  identifier: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: string;
  createdAt: number;
}

interface MemberListProps {
  members: OrgMember[];
}

const roleStyles: Record<string, string> = {
  owner: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  admin: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  member: "bg-blue-100 text-blue-700 border-blue-200",
};

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function MemberList({ members }: MemberListProps) {
  if (members.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No members found.</p>;
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {members.map((member) => {
        const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.identifier;
        return (
          <div key={member.id} className="flex items-center gap-4 py-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0">
              {member.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.imageUrl} alt={fullName} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{fullName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.identifier}</p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${roleStyles[member.role] ?? "text-slate-500"}`}
            >
              {roleLabels[member.role] ?? member.role}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

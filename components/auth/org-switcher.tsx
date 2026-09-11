"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, Plus } from "lucide-react";

interface OrgSwitcherProps {
  activeOrgId?: string;
  activeOrgName?: string;
}

interface OrgListItem {
  id: string;
  name: string;
  slug: string | null;
}

export function OrgSwitcher({ activeOrgId, activeOrgName }: OrgSwitcherProps) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    authClient.organization.list().then((res) => {
      if (res.data) {
        setOrgs(res.data.map((o) => ({ id: o.id, name: o.name, slug: o.slug })));
      }
    });
  }, []);

  async function switchOrg(orgId: string) {
    await authClient.organization.setActive({ organizationId: orgId });
    router.refresh();
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const slug = newOrgName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const result = await authClient.organization.create({ name: newOrgName.trim(), slug });
      if (result.data) {
        await authClient.organization.setActive({ organizationId: result.data.id });
        setNewOrgName("");
        setShowCreate(false);
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2 py-1.5">
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {activeOrgName || "Personal Account"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => switchOrg("")}
          className={!activeOrgId ? "bg-slate-100 dark:bg-slate-800" : ""}
        >
          Personal Account
        </DropdownMenuItem>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrg(org.id)}
            className={org.id === activeOrgId ? "bg-slate-100 dark:bg-slate-800" : ""}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {showCreate ? (
          <div className="p-2 space-y-2">
            <Input
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createOrg()}
              className="h-8 text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={createOrg} disabled={creating} className="h-7 text-xs flex-1">
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-7 text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <DropdownMenuItem onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

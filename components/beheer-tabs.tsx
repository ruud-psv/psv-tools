"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plug, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/user-management";
import { McpBeheer } from "@/components/mcp-beheer";

export type BeheerTab = "gebruikers" | "mcp";

/**
 * De tabbladen van Beheer. Het gekozen tabblad staat in de URL (`?tab=mcp`),
 * zodat je naar een tabblad kunt linken en verversen je op dezelfde plek laat.
 */
export function BeheerTabs({ initialTab }: { initialTab: BeheerTab }) {
  const [tab, setTab] = useState<BeheerTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  function kies(value: string) {
    const next: BeheerTab = value === "mcp" ? "mcp" : "gebruikers";
    setTab(next);
    router.replace(next === "mcp" ? `${pathname}?tab=mcp` : pathname, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={kies}>
      <TabsList className="mb-4">
        <TabsTrigger value="gebruikers" className="gap-2 font-heading uppercase tracking-wide">
          <Users className="h-4 w-4" />
          Gebruikers
        </TabsTrigger>
        <TabsTrigger value="mcp" className="gap-2 font-heading uppercase tracking-wide">
          <Plug className="h-4 w-4" />
          MCP Servers
        </TabsTrigger>
      </TabsList>
      <TabsContent value="gebruikers">
        <UserManagement />
      </TabsContent>
      <TabsContent value="mcp">
        <McpBeheer />
      </TabsContent>
    </Tabs>
  );
}

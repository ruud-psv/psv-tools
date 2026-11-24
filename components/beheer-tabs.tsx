"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plug, Sprout, Timer, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/user-management";
import { McpBeheer } from "@/components/mcp-beheer";
import { ModelGarden } from "@/components/model-garden";
import { CronBeheer } from "@/components/cron-beheer";

export type BeheerTab = "gebruikers" | "mcp" | "modellen" | "crons";

function leesBeheerTab(tab?: string): BeheerTab {
  return tab === "mcp" || tab === "modellen" || tab === "crons" ? tab : "gebruikers";
}

/**
 * De tabbladen van Beheer. Het gekozen tabblad staat in de URL (`?tab=mcp`),
 * (of `?tab=modellen`, `?tab=crons`), zodat je naar een tabblad kunt linken en verversen je op dezelfde plek laat.
 */
export function BeheerTabs({ initialTab }: { initialTab: BeheerTab }) {
  const [tab, setTab] = useState<BeheerTab>(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  function kies(value: string) {
    const next = leesBeheerTab(value);
    setTab(next);
    router.replace(next === "gebruikers" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={kies}>
      <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="gebruikers" className="gap-2 font-heading uppercase tracking-wide">
          <Users className="h-4 w-4" />
          Gebruikers
        </TabsTrigger>
        <TabsTrigger value="mcp" className="gap-2 font-heading uppercase tracking-wide">
          <Plug className="h-4 w-4" />
          MCP Servers
        </TabsTrigger>
        <TabsTrigger value="modellen" className="gap-2 font-heading uppercase tracking-wide">
          <Sprout className="h-4 w-4" />
          Model garden
        </TabsTrigger>
        <TabsTrigger value="crons" className="gap-2 font-heading uppercase tracking-wide">
          <Timer className="h-4 w-4" />
          Crons
        </TabsTrigger>
      </TabsList>
      <TabsContent value="gebruikers">
        <UserManagement />
      </TabsContent>
      <TabsContent value="mcp">
        <McpBeheer />
      </TabsContent>
      <TabsContent value="modellen">
        <ModelGarden />
      </TabsContent>
      <TabsContent value="crons">
        <CronBeheer />
      </TabsContent>
    </Tabs>
  );
}

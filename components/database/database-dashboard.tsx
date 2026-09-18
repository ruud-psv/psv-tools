"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignsTab } from "@/components/database/campaigns-tab";
import { Notice } from "@/components/database/shared";
import { OverviewTab } from "@/components/database/overview-tab";
import { SourceTab } from "@/components/database/source-tab";
import type { Campaign, SourceState } from "@/lib/database/types";

const EMPTY_STATE: SourceState = { activeVersionId: null, versions: [] };

export function DatabaseDashboard() {
  const [state, setState] = useState<SourceState>(EMPTY_STATE);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sourceRes, campaignRes] = await Promise.all([
        fetch("/api/database/source", { cache: "no-store" }),
        fetch("/api/database/campaigns", { cache: "no-store" }),
      ]);
      const sourceData = await sourceRes.json();
      const campaignData = await campaignRes.json();
      if (!sourceRes.ok) throw new Error(sourceData.error ?? "Ophalen van de bron mislukt.");
      if (!campaignRes.ok) {
        throw new Error(campaignData.error ?? "Ophalen van campagnes mislukt.");
      }

      setState(sourceData as SourceState);
      setCampaigns(campaignData.campaigns as Campaign[]);
      setStaleCount(campaignData.staleCount as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Na een nieuwe bron staan alle uitkomsten op verouderd. Alles in één keer
   * hertellen en daarna herladen, zodat de tabbladen hetzelfde beeld tonen.
   */
  const reanalyze = useCallback(async () => {
    setReanalyzing(true);
    setError(null);
    try {
      // `stale=1`: precies de campagnes die de knop noemt. Campagnes zonder
      // analyse tellen daar ook in mee.
      const res = await fetch("/api/database/analyze-all?stale=1", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opnieuw analyseren mislukt.");
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        setError(
          `Niet alles is gelukt: ${data.failed
            .map((f: { title: string; error: string }) => `${f.title} (${f.error})`)
            .join(", ")}`
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReanalyzing(false);
    }
  }, [load]);

  const onSourceChanged = useCallback(
    (next: SourceState) => {
      setState(next);
      // De campagne-uitkomsten horen nu bij een oudere bron; opnieuw ophalen
      // zet `staleCount` goed zonder aannames hier.
      void load();
    },
    [load]
  );

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laden
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Notice tone="error" title="Er ging iets mis">
          {error}
        </Notice>
      )}

      <Tabs defaultValue="bron">
        <TabsList>
          <TabsTrigger value="bron">Bron</TabsTrigger>
          <TabsTrigger value="campagnes">
            Campagnes
            {campaigns.length > 0 && (
              <span className="ml-1.5 text-muted-foreground">{campaigns.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
        </TabsList>

        <TabsContent value="bron" className="mt-4">
          <SourceTab
            state={state}
            onSourceChanged={onSourceChanged}
            onReanalyze={reanalyze}
            staleCount={staleCount}
            reanalyzing={reanalyzing}
          />
        </TabsContent>

        <TabsContent value="campagnes" className="mt-4">
          <CampaignsTab
            campaigns={campaigns}
            activeVersionId={state.activeVersionId}
            hasSource={state.activeVersionId !== null}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="overzicht" className="mt-4">
          <OverviewTab campaigns={campaigns} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

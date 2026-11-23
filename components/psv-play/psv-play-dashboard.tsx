"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptySection } from "@/components/paid-ads/shared";
import { cn } from "@/lib/utils";
import { datumLang } from "./format";
import {
  ContentTab,
  LiveTab,
  OverzichtTab,
  PubliekTab,
  type ContentData,
  type LiveData,
  type OverzichtData,
  type PubliekData,
  type Uitleg,
} from "./tabs";

type Tab = "overzicht" | "content" | "live" | "publiek";
const TABS: { key: Tab; label: string }[] = [
  { key: "overzicht", label: "Overzicht" },
  { key: "content", label: "Content" },
  { key: "live", label: "Live" },
  { key: "publiek", label: "Publiek" },
];

type PeriodeKeuze = "7d" | "30d" | "90d" | "season" | "custom";
const PERIODES: { value: PeriodeKeuze; label: string }[] = [
  { value: "7d", label: "Laatste 7 dagen" },
  { value: "30d", label: "Laatste 30 dagen" },
  { value: "90d", label: "Laatste 90 dagen" },
  { value: "season", label: "Dit seizoen" },
  { value: "custom", label: "Eigen periode" },
];

const SORTEREN = [
  { value: "kijktijd", label: "Kijktijd" },
  { value: "plays", label: "Plays" },
  { value: "unieke_kijkers", label: "Unieke kijkers" },
  { value: "complete_rate", label: "Complete rate" },
];
const TYPES = ["persconferentie", "oefenwedstrijd", "docu", "interview", "behind-the-scenes", "samenvatting", "Ongecategoriseerd"];
const TEAMS = [
  { value: "psv1", label: "PSV 1" },
  { value: "vrouwen", label: "PSV Vrouwen" },
  { value: "jong", label: "Jong PSV" },
  { value: "jeugd", label: "Jeugd" },
];
const ALLE = "alle";

interface Meta {
  sites: { id: string; label: string }[];
  site: { id: string; label: string };
  onderdelen: Record<string, Uitleg>;
}

interface Periodekop {
  periode: { start_date: string; end_date: string; label: string };
  vorige_periode: { start_date: string; end_date: string };
  data_through: string;
}

type Data = (OverzichtData | ContentData | LiveData | PubliekData) & Partial<Periodekop> & { beschikbaar?: boolean; uitleg?: string };

export function PsvPlayDashboard() {
  const [tab, setTab] = useState<Tab>("overzicht");
  const [periode, setPeriode] = useState<PeriodeKeuze>("30d");
  const [eigen, setEigen] = useState({ van: "", tot: "" });
  const [eigenToegepast, setEigenToegepast] = useState({ van: "", tot: "" });
  const [site, setSite] = useState<string | null>(null);
  const [sorteer, setSorteer] = useState("kijktijd");
  const [type, setType] = useState(ALLE);
  const [team, setTeam] = useState(ALLE);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [data, setData] = useState<Record<string, Data>>({});
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [vernieuw, setVernieuw] = useState(0);

  // Eerst wat de API kan. De allereerste keer test PSV Tools dat (zo'n minuut).
  useEffect(() => {
    let weg = false;
    fetch(`/api/psv-play?onderdeel=meta${site ? `&site=${site}` : ""}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `Fout ${r.status}`);
        if (!weg) setMeta(body);
      })
      .catch((e) => !weg && setFout(e instanceof Error ? e.message : String(e)));
    return () => {
      weg = true;
    };
  }, [site]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ onderdeel: tab });
    if (periode === "custom") {
      if (!eigenToegepast.van) return null;
      q.set("van", eigenToegepast.van);
      if (eigenToegepast.tot) q.set("tot", eigenToegepast.tot);
    } else q.set("preset", periode);
    if (site) q.set("site", site);
    if (tab === "content") {
      q.set("sorteer", sorteer);
      if (type !== ALLE) q.set("type", type);
      if (team !== ALLE) q.set("team", team);
    }
    return q.toString();
  }, [tab, periode, eigenToegepast, site, sorteer, type, team]);

  const sleutel = query ? `${query}#${vernieuw}` : null;

  const haal = useCallback(async (q: string, k: string) => {
    setLaden(true);
    setFout(null);
    try {
      const r = await fetch(`/api/psv-play?${q}`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `Fout ${r.status}`);
      setData((d) => ({ ...d, [k]: body }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    if (!meta || !query || !sleutel || data[sleutel]) return;
    void haal(query, sleutel);
  }, [meta, query, sleutel, data, haal]);

  const huidig = sleutel ? data[sleutel] : undefined;
  const onderdelen = meta?.onderdelen ?? {};
  const tabUitleg = (t: Tab): string | null => {
    const o = t === "content" ? onderdelen.content : t === "live" ? onderdelen.live : null;
    return o && !o.ok ? o.uitleg : null;
  };

  return (
    <div className="space-y-5">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max overflow-hidden rounded-md border border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "whitespace-nowrap px-5 py-2 font-heading text-sm uppercase tracking-wide transition-colors",
                tab === t.key ? "bg-psv-red-primary text-white" : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={periode} onValueChange={(v) => setPeriode(v as PeriodeKeuze)}>
          <SelectTrigger className="w-48" aria-label="Periode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {periode === "custom" && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setEigenToegepast(eigen);
            }}
          >
            <Input type="date" aria-label="Van" value={eigen.van} onChange={(e) => setEigen((x) => ({ ...x, van: e.target.value }))} className="w-40" required />
            <span className="text-sm text-muted-foreground">tot en met</span>
            <Input type="date" aria-label="Tot en met" value={eigen.tot} onChange={(e) => setEigen((x) => ({ ...x, tot: e.target.value }))} className="w-40" />
            <button type="submit" className="btn btn--medium">
              Toepassen
            </button>
          </form>
        )}

        {meta && meta.sites.length > 1 && (
          <Select value={site ?? meta.site.id} onValueChange={(v) => setSite(v)}>
            <SelectTrigger className="w-48" aria-label="Property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meta.sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {tab === "content" && onderdelen.content?.ok && (
          <>
            <Select value={sorteer} onValueChange={setSorteer}>
              <SelectTrigger className="w-44" aria-label="Sorteer op">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTEREN.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    Op {s.label.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle types</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "Ongecategoriseerd" ? t : t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="w-40" aria-label="Team">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle teams</SelectItem>
                {TEAMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <button
          onClick={() => setVernieuw((n) => n + 1)}
          disabled={laden}
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", laden && "animate-spin")} />
          Vernieuwen
        </button>
      </div>

      {huidig?.periode && (
        <p className="text-sm text-muted-foreground">
          {datumLang(huidig.periode.start_date)} tot en met {datumLang(huidig.periode.end_date)}, vergeleken met{" "}
          {datumLang(huidig.vorige_periode?.start_date)} tot en met {datumLang(huidig.vorige_periode?.end_date)}.
        </p>
      )}

      {fout && (
        <div className="alert alert--error flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{fout}</span>
        </div>
      )}

      {!meta && !fout && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verbinden met JW Player. De eerste keer test PSV Tools wat de licentie toelaat; dat duurt ongeveer een minuut.
        </div>
      )}

      {meta && tabUitleg(tab) ? (
        <EmptySection>{tabUitleg(tab)}</EmptySection>
      ) : periode === "custom" && !eigenToegepast.van ? (
        <EmptySection>Kies een begindatum en klik op Toepassen.</EmptySection>
      ) : laden && !huidig ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cijfers ophalen…
        </div>
      ) : huidig && huidig.beschikbaar === false ? (
        <EmptySection>{huidig.uitleg}</EmptySection>
      ) : huidig ? (
        <>
          {tab === "overzicht" && <OverzichtTab data={huidig as OverzichtData} />}
          {tab === "content" && <ContentTab data={huidig as ContentData} afhaak={onderdelen.afhaakcurve ?? { ok: true }} />}
          {tab === "live" && <LiveTab data={huidig as LiveData} />}
          {tab === "publiek" && <PubliekTab data={huidig as PubliekData} onderdelen={onderdelen} />}
        </>
      ) : null}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Datums zijn JW-datums: JW Player telt in US Eastern. Een dag loopt in Nederland daardoor van 06.00 tot 06.00 uur (een paar weken per
        jaar van 05.00 tot 05.00 uur). De cijfers lopen tot en met de laatste volledige dag
        {huidig?.data_through ? `, ${datumLang(huidig.data_through)}` : ""}. Unieke kijkers zijn een benadering (IP-adres plus browser) en
        tellen niet op over dagen of video&apos;s.
      </p>
    </div>
  );
}

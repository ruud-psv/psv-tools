"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SortHeader, sortRows, timeValue, useTableSort, type SortAccessors } from "@/lib/table-sort";
import { formatDateTime } from "@/lib/dm-share";
import { cn } from "@/lib/utils";
import { utmCreatorLabel, type UtmLinkRecord } from "@/lib/utm";

type SortKey = "createdAt" | "age" | "campaign" | "source" | "medium" | "url" | "createdBy";

const ACCESSORS: SortAccessors<UtmLinkRecord, SortKey> = {
  createdAt: (r) => timeValue(r.createdAt),
  // Ouderdom is de omgekeerde volgorde van de aanmaakdatum; sorteer op dezelfde
  // waarde zodat "laag naar hoog" de jongste link bovenaan zet.
  age: (r) => timeValue(r.createdAt),
  campaign: (r) => r.campaign,
  source: (r) => r.source,
  medium: (r) => r.medium,
  url: (r) => r.url,
  createdBy: (r) => utmCreatorLabel(r),
};

/** Hele dagen tussen het aanmaken en vandaag; null bij een ongeldige datum. */
function daysSince(iso: string): number | null {
  const created = new Date(iso);
  if (!Number.isFinite(created.getTime())) return null;
  const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - createdDay.getTime()) / 86_400_000));
}

/** Leesbare ouderdom: "vandaag", "gisteren", "12 dagen". */
function ageLabel(iso: string): string {
  const days = daysSince(iso);
  if (days === null) return "—";
  if (days === 0) return "vandaag";
  if (days === 1) return "gisteren";
  return `${days} dagen`;
}

/** Overzicht van alle links die met deze tool zijn aangemaakt. */
export function UtmLinksTable({
  links,
  loading,
  error,
  onRefresh,
  onDeleted,
}: {
  links: UtmLinkRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onDeleted: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const { sort, toggle } = useTableSort<SortKey>("createdAt", "desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? links.filter((l) =>
          [l.url, l.source, l.medium, l.campaign, l.term, l.content, l.createdBy]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      : links;
    return sortRows(filtered, ACCESSORS[sort.key], sort.dir);
  }, [links, query, sort]);

  function copyLink(link: UtmLinkRecord) {
    navigator.clipboard
      .writeText(link.generatedUrl)
      .then(() => {
        setCopiedId(link.id);
        setTimeout(() => setCopiedId((cur) => (cur === link.id ? null : cur)), 2000);
      })
      .catch(() => {});
  }

  async function handleDelete(link: UtmLinkRecord) {
    setDeletingId(link.id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/utm-links/${link.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Verwijderen mislukt.");
        return;
      }
      onDeleted(link.id);
    } catch {
      setDeleteError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op campagne, bron, medium of URL"
            className="pl-9"
            aria-label="Zoek in aangemaakte UTM-links"
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {rows.length} van {links.length} link{links.length === 1 ? "" : "s"}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Vernieuwen
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {error}
        </p>
      )}
      {deleteError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {deleteError}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <SortHeader label="Aangemaakt" sortKey="createdAt" sort={sort} onSort={toggle} align="left" firstDir="desc" className="text-muted-foreground whitespace-nowrap" />
              <SortHeader label="Ouderdom" sortKey="age" sort={sort} onSort={toggle} align="left" firstDir="desc" className="text-muted-foreground whitespace-nowrap" />
              <SortHeader label="Campagne" sortKey="campaign" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Bron" sortKey="source" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Medium" sortKey="medium" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Bestemming" sortKey="url" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Door" sortKey="createdBy" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <th className="px-4 py-3 text-right text-xs font-heading uppercase tracking-wide text-muted-foreground">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && links.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Links laden…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {links.length === 0
                    ? "Nog geen UTM-links aangemaakt met deze tool."
                    : "Geen links gevonden voor deze zoekopdracht."}
                </td>
              </tr>
            )}
            {rows.map((link) => (
              <tr key={link.id} className="border-b border-border last:border-0 align-top hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(link.createdAt)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-xs whitespace-nowrap",
                    (daysSince(link.createdAt) ?? 0) >= 365 ? "text-warning" : "text-muted-foreground"
                  )}
                  title={`Aangemaakt op ${formatDateTime(link.createdAt)}`}
                >
                  {ageLabel(link.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium max-w-[200px]">
                  <span className="block truncate" title={link.campaign}>{link.campaign}</span>
                  {(link.term || link.content) && (
                    <span className="mt-0.5 block text-xs text-muted-foreground truncate">
                      {[link.term && `term: ${link.term}`, link.content && `content: ${link.content}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="whitespace-nowrap">{link.source}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="whitespace-nowrap">{link.medium}</Badge>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <a
                    href={link.generatedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                    title={link.generatedUrl}
                  >
                    <span className="truncate font-mono text-xs">{link.url}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px]">
                  <span className="block truncate" title={link.createdBy}>{utmCreatorLabel(link)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => copyLink(link)}
                    >
                      {copiedId === link.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Gekopieerd
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Kopieer
                        </>
                      )}
                    </Button>
                    {confirmDeleteId === link.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDelete(link)}
                          disabled={deletingId === link.id}
                          className="gap-1.5"
                        >
                          {deletingId === link.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Verwijderen
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === link.id}
                        >
                          Annuleer
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Verwijder link voor ${link.campaign}`}
                        onClick={() => {
                          setDeleteError("");
                          setConfirmDeleteId(link.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

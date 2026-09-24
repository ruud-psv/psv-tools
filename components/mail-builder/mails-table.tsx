"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SortHeader, sortRows, timeValue, useTableSort, type SortAccessors } from "@/lib/table-sort";
import { formatDateTime } from "@/lib/dm-share";
import { nameFromEmail } from "@/lib/utm";
import { cn } from "@/lib/utils";
import type { MailRecord } from "@/lib/mail-builder/mails";

type SortKey = "createdAt" | "age" | "dmid" | "naam" | "template" | "blokken" | "createdBy";

function makerLabel(mail: Pick<MailRecord, "createdBy" | "createdByName">): string {
  return mail.createdByName?.trim() || nameFromEmail(mail.createdBy);
}

/** De datum waarop de rij voor het laatst is bijgewerkt of aangemaakt. */
function datumVan(mail: MailRecord): string {
  return mail.updatedAt ?? mail.createdAt;
}

const ACCESSORS: SortAccessors<MailRecord, SortKey> = {
  createdAt: (r) => timeValue(datumVan(r)),
  age: (r) => timeValue(datumVan(r)),
  dmid: (r) => r.dmid ?? "",
  naam: (r) => r.naam,
  template: (r) => r.template,
  blokken: (r) => r.aantalBlokken,
  createdBy: (r) => makerLabel(r),
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function daysSince(iso: string): number | null {
  const created = new Date(iso);
  if (!Number.isFinite(created.getTime())) return null;
  const createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - createdDay.getTime()) / 86_400_000));
}

function ageLabel(iso: string): string {
  const days = daysSince(iso);
  if (days === null) return "—";
  if (days === 0) return "vandaag";
  if (days === 1) return "gisteren";
  return `${days} dagen`;
}

/** Overzicht van de mails die met deze tool zijn gedownload. */
export function MailsTable({
  mails,
  loading,
  error,
  onRefresh,
  onDeleted,
}: {
  mails: MailRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onDeleted: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const { sort, toggle } = useTableSort<SortKey>("createdAt", "desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? mails.filter((m) =>
          [m.naam, m.dmid, m.template, m.previewTekst, m.createdBy, m.createdByName]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      : mails;
    return sortRows(filtered, ACCESSORS[sort.key], sort.dir);
  }, [mails, query, sort]);

  async function handleDelete(mail: MailRecord) {
    setDeletingId(mail.id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/mail-builder/mails/${mail.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Verwijderen mislukt.");
        return;
      }
      onDeleted(mail.id);
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
            placeholder="Zoek op mailnaam, DMID of maker"
            className="pl-9"
            aria-label="Zoek in aangemaakte mails"
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {rows.length} van {mails.length} mail{mails.length === 1 ? "" : "s"}
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
              <SortHeader label="DMID" sortKey="dmid" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Mailnaam" sortKey="naam" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Template" sortKey="template" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <SortHeader label="Blokken" sortKey="blokken" sort={sort} onSort={toggle} align="right" firstDir="desc" className="text-muted-foreground" />
              <SortHeader label="Door" sortKey="createdBy" sort={sort} onSort={toggle} align="left" firstDir="asc" className="text-muted-foreground" />
              <th className="px-4 py-3 text-right text-xs font-heading uppercase tracking-wide text-muted-foreground">
                Acties
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && mails.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Mails laden…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {mails.length === 0
                    ? "Nog geen mails gedownload met deze tool."
                    : "Geen mails gevonden voor deze zoekopdracht."}
                </td>
              </tr>
            )}
            {rows.map((mail) => (
              <tr key={mail.id} className="border-b border-border last:border-0 align-top hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap" title={formatDateTime(datumVan(mail))}>
                  {formatDate(datumVan(mail))}
                  {mail.updatedAt && <span className="block text-[10px]">bijgewerkt</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {ageLabel(datumVan(mail))}
                </td>
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{mail.dmid || "—"}</td>
                <td className="px-4 py-3 font-medium max-w-[280px]">
                  <span className="block truncate" title={mail.naam}>{mail.naam}</span>
                  {mail.previewTekst && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={mail.previewTekst}>
                      {mail.previewTekst}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary" className="whitespace-nowrap">{mail.template}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{mail.aantalBlokken}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px]">
                  <span className="block truncate" title={mail.createdBy}>{makerLabel(mail)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {confirmDeleteId === mail.id ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDelete(mail)}
                          disabled={deletingId === mail.id}
                          className="gap-1.5"
                        >
                          {deletingId === mail.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Verwijderen
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === mail.id}
                        >
                          Annuleer
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Verwijder ${mail.naam} uit het overzicht`}
                        onClick={() => {
                          setDeleteError("");
                          setConfirmDeleteId(mail.id);
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Copy, Pencil, Trash2, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/dm-share";
import type { ReportRecord } from "@/lib/reports";
import { SOURCE_META, periodLabel } from "@/components/report-wizard/constants";
import { ReportWizard } from "@/components/report-wizard/ReportWizard";

/* ---------- Lijst van aangemaakte rapporten ---------- */

function sourcePeriodLabel(report: ReportRecord, key: (typeof SOURCE_META)[number]["key"]): string {
  const src = report.sources[key];
  if (!src) return "";
  if (key === "ticketing") {
    const tk = report.sources.ticketing!;
    return tk.mode === "period" ? periodLabel(tk.period) : "Actuele status";
  }
  return periodLabel((src as { period?: Parameters<typeof periodLabel>[0] }).period);
}

function ReportList({
  reports, loading, error, onRefresh, onEdit, onDeleted, onNew,
}: {
  reports: ReportRecord[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onEdit: (report: ReportRecord) => void;
  onDeleted: (id: string) => void;
  onNew: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  function copyLink(report: ReportRecord) {
    navigator.clipboard.writeText(`${window.location.origin}/share/rapportage?id=${report.id}`)
      .then(() => {
        setCopiedId(report.id);
        setTimeout(() => setCopiedId((cur) => (cur === report.id ? null : cur)), 2000);
      })
      .catch(() => {});
  }

  async function handleDelete(report: ReportRecord) {
    setDeletingId(report.id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Verwijderen mislukt.");
        return;
      }
      onDeleted(report.id);
    } catch {
      setDeleteError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" onClick={onNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nieuw rapport
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Vernieuwen
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">{error}</p>
      )}
      {deleteError && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">{deleteError}</p>
      )}

      {!error && !loading && reports.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">
          Nog geen rapporten aangemaakt. Klik op &quot;Nieuw rapport&quot; om te beginnen.
        </p>
      )}
      {loading && reports.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">Rapporten laden…</p>
      )}

      <div className="space-y-3">
        {reports.map((report) => {
          const activeSources = SOURCE_META.filter((m) => !!report.sources[m.key]?.enabled);
          return (
            <Card key={report.id}>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-heading uppercase tracking-wide truncate">{report.title}</p>
                    {report.intro && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{report.intro}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      door {report.createdBy} · {formatDateTime(report.createdAt)}
                      {report.updatedAt !== report.createdAt && " · bewerkt"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeSources.map((m) => {
                      const Icon = m.icon;
                      return (
                        <span
                          key={m.key}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          title={`${m.label} · ${sourcePeriodLabel(report, m.key)}`}
                        >
                          <Icon className="h-3 w-3" />
                          {m.short}
                          <span className="text-primary/60">· {sourcePeriodLabel(report, m.key)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copyLink(report)} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedId === report.id ? "Gekopieerd" : "Kopieer link"}
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={`/share/rapportage?id=${report.id}`} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(report)} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Bewerk
                  </Button>
                  {confirmDeleteId === report.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(report)} disabled={deletingId === report.id}>
                        {deletingId === report.id ? "Verwijderen…" : "Bevestig verwijderen"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>Annuleren</Button>
                    </span>
                  ) : (
                    <Button
                      type="button" variant="ghost" size="sm"
                      onClick={() => { setConfirmDeleteId(report.id); setDeleteError(""); }}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Verwijder
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Hoofdcomponent ---------- */

export function RapportageGenerator() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [view, setView] = useState<"list" | "wizard">("list");
  const [editing, setEditing] = useState<ReportRecord | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  const loadReports = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      if (!res.ok) {
        setListError(data.error ?? "Ophalen van rapporten mislukt.");
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setListError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  function openNew() {
    setEditing(null);
    setWizardKey((k) => k + 1);
    setView("wizard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(report: ReportRecord) {
    setEditing(report);
    setWizardKey((k) => k + 1);
    setView("wizard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeWizard() {
    setView("list");
    setEditing(null);
  }

  function handleSaved(report: ReportRecord) {
    setReports((prev) => {
      const without = prev.filter((r) => r.id !== report.id);
      return [report, ...without].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  function handleDeleted(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  if (view === "wizard") {
    return (
      <ReportWizard
        key={`${editing?.id ?? "new"}-${wizardKey}`}
        initial={editing}
        onSaved={handleSaved}
        onClose={closeWizard}
      />
    );
  }

  return (
    <ReportList
      reports={reports}
      loading={listLoading}
      error={listError}
      onRefresh={loadReports}
      onEdit={openEdit}
      onDeleted={handleDeleted}
      onNew={openNew}
    />
  );
}

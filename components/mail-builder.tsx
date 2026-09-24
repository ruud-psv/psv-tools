"use client";

import { useCallback, useEffect, useState } from "react";
import { MailBuilderForm } from "@/components/mail-builder-form";
import { MailsTable } from "@/components/mail-builder/mails-table";
import type { MailRecord } from "@/lib/mail-builder/mails";

/** De builder met daaronder het overzicht van alles wat is gedownload. */
export function MailBuilder() {
  const [mails, setMails] = useState<MailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMails = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mail-builder/mails");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Ophalen van het mailoverzicht mislukt.");
        return;
      }
      setMails(Array.isArray(data.mails) ? (data.mails as MailRecord[]) : []);
    } catch {
      setError("Kon de server niet bereiken. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMails();
  }, [loadMails]);

  return (
    <div className="space-y-10">
      <MailBuilderForm
        onOpgeslagen={(mail) =>
          setMails((cur) => [mail, ...cur.filter((m) => m.id !== mail.id)])
        }
      />

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-2xl uppercase tracking-tight">Aangemaakte mails</h2>
          <p className="text-sm text-muted-foreground">
            Elke download komt hier te staan. Iedereen ziet elkaars mails.
          </p>
        </div>
        <MailsTable
          mails={mails}
          loading={loading}
          error={error}
          onRefresh={() => void loadMails()}
          onDeleted={(id) => setMails((cur) => cur.filter((m) => m.id !== id))}
        />
      </section>
    </div>
  );
}

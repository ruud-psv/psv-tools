"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UtmBuilderForm } from "@/components/utm-builder-form";
import { UtmLinksTable } from "@/components/utm-links-table";
import {
  DEFAULT_MEDIUMS,
  DEFAULT_SOURCES,
  normalizeTaxonomyValue,
  type UtmLinkRecord,
  type UtmTaxonomy,
} from "@/lib/utm";

/** Tot de server-lijsten binnen zijn tonen we alvast de standaardwaarden. */
const INITIAL_TAXONOMY: UtmTaxonomy = {
  sources: [...DEFAULT_SOURCES],
  mediums: [...DEFAULT_MEDIUMS],
};

export function UtmBuilder() {
  const [taxonomy, setTaxonomy] = useState<UtmTaxonomy>(INITIAL_TAXONOMY);
  const [links, setLinks] = useState<UtmLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/utm-links");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Ophalen van de aangemaakte links mislukt.");
        return;
      }
      setLinks(Array.isArray(data.links) ? data.links : []);
    } catch {
      setError("Kon de server niet bereiken.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTaxonomy = useCallback(async () => {
    try {
      const res = await fetch("/api/utm-taxonomy");
      if (!res.ok) return; // Standaardlijsten blijven staan.
      const data = await res.json().catch(() => ({}));
      if (data.taxonomy?.sources && data.taxonomy?.mediums) {
        setTaxonomy(data.taxonomy as UtmTaxonomy);
      }
    } catch {
      // Zonder server-taxonomie werkt de tool door op de standaardlijsten.
    }
  }, []);

  useEffect(() => {
    void loadLinks();
    void loadTaxonomy();
  }, [loadLinks, loadTaxonomy]);

  const addTaxonomyValue = useCallback(
    async (
      kind: "source" | "medium",
      value: string
    ): Promise<{ value: string } | { error: string }> => {
      try {
        const res = await fetch("/api/utm-taxonomy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { error: data.error ?? "Toevoegen mislukt." };

        const updated = data.taxonomy as UtmTaxonomy | undefined;
        if (!updated?.sources || !updated?.mediums) return { error: "Toevoegen mislukt." };
        setTaxonomy(updated);

        // De server normaliseert de waarde (spaties → underscores). Zoek die
        // versie op, zodat precies de opgeslagen tekst geselecteerd wordt en
        // niet de ruwe invoer.
        const normalized = normalizeTaxonomyValue(value);
        const list = kind === "source" ? updated.sources : updated.mediums;
        const match = list.find((v) => v.toLowerCase() === normalized.toLowerCase());
        return { value: match ?? normalized };
      } catch {
        return { error: "Kon de server niet bereiken." };
      }
    },
    []
  );

  const handleSaved = useCallback((link: UtmLinkRecord) => {
    setLinks((cur) => [link, ...cur.filter((l) => l.id !== link.id)]);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setLinks((cur) => cur.filter((l) => l.id !== id));
  }, []);

  return (
    <div className="space-y-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Nieuwe UTM-link</CardTitle>
          <CardDescription>
            Vul de URL en UTM-parameters in om een trackbare campagnelink te
            genereren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UtmBuilderForm
            taxonomy={taxonomy}
            onAddTaxonomy={addTaxonomyValue}
            onSaved={handleSaved}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aangemaakte UTM-links</CardTitle>
          <CardDescription>
            Alle links die met deze tool zijn aangemaakt, nieuwste eerst.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UtmLinksTable
            links={links}
            loading={loading}
            error={error}
            onRefresh={() => void loadLinks()}
            onDeleted={handleDeleted}
          />
        </CardContent>
      </Card>
    </div>
  );
}

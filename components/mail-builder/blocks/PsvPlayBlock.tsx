"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/mail-builder-form";
import { newPsvPlayItem } from "@/components/mail-builder-form";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function PsvPlayBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  function updateItem<K extends keyof (typeof state.psvplayItems)[0]>(
    i: number,
    key: K,
    value: (typeof state.psvplayItems)[0][K]
  ) {
    onChange({
      psvplayItems: state.psvplayItems.map((it, j) => (j === i ? { ...it, [key]: value } : it)),
    });
  }

  return (
    <>
      {/* Intro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Intro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ppIntro">Tekst (rood blok)</Label>
            <RichTextEditor
              value={state.psvplayIntroText}
              onChange={(html) => onChange({ psvplayIntroText: html })}
              className="min-h-[80px] text-sm"
            />
            {!state.psvplayIntroText && (
              <p className="text-xs text-muted-foreground">
                Tip: gebruik de{" "}
                <a
                  href="https://tools.psv.nl/dashboard/copy-generator"
                  target="_blank"
                  className="underline hover:text-foreground transition-colors"
                >
                  Mail tekst generator
                </a>{" "}
                om tekst op te bouwen.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>CTA-knop</Label>
            <Input
              placeholder="BEKIJK OP PSV PLAY"
              value={state.psvplayCta1Label}
              onChange={(e) => onChange({ psvplayCta1Label: e.target.value })}
            />
            <Input
              placeholder="https://www.psv.nl/psv-play"
              value={state.psvplayCta1Url}
              onChange={(e) => onChange({ psvplayCta1Url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Secundaire link (optioneel)</Label>
            <Input
              placeholder="Meer over PSV Play >"
              value={state.psvplayCta2Label}
              onChange={(e) => onChange({ psvplayCta2Label: e.target.value })}
            />
            <Input
              placeholder="https://www.psv.nl/psv-play"
              value={state.psvplayCta2Url}
              onChange={(e) => onChange({ psvplayCta2Url: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Video items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Video items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.psvplayItems.map((item, i) => (
            <div key={item.id} className="rounded-md border border-input bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Item {i + 1} — foto {i % 2 === 0 ? "links" : "rechts"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ psvplayItems: state.psvplayItems.filter((_, j) => j !== i) })
                  }
                  className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Verwijder item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://…"
                    value={item.imagePreviewUrl}
                    onChange={(e) => updateItem(i, "imagePreviewUrl", e.target.value)}
                    className="h-8 text-xs flex-1 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8 px-2"
                    disabled={uploadingField !== null}
                    onClick={() =>
                      triggerUpload(`pp-item-${i}`, (url) => updateItem(i, "imagePreviewUrl", url))
                    }
                  >
                    {uploadingField === `pp-item-${i}` ? (
                      <span className="text-xs">…</span>
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Alt-tekst"
                    value={item.imageAlt}
                    onChange={(e) => updateItem(i, "imageAlt", e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="Klik-link (opt.)"
                    value={item.imageLink}
                    onChange={(e) => updateItem(i, "imageLink", e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                </div>
                <RichTextEditor
                  value={item.quote}
                  onChange={(html) => updateItem(i, "quote", html)}
                  className="min-h-[60px] text-xs"
                />
                {!item.quote && (
                  <p className="text-xs text-muted-foreground">
                    Tip: gebruik de{" "}
                    <a
                      href="https://tools.psv.nl/dashboard/copy-generator"
                      target="_blank"
                      className="underline hover:text-foreground transition-colors"
                    >
                      Mail tekst generator
                    </a>{" "}
                    om tekst op te bouwen.
                  </p>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="BEKIJK NU"
                    value={item.ctaLabel}
                    onChange={(e) => updateItem(i, "ctaLabel", e.target.value)}
                    className="h-8 text-xs w-36 flex-shrink-0"
                  />
                  <Input
                    placeholder="https://www.psv.nl/psv-play"
                    value={item.ctaUrl}
                    onChange={(e) => updateItem(i, "ctaUrl", e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ psvplayItems: [...state.psvplayItems, newPsvPlayItem()] })}
            className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Item toevoegen
          </button>
        </CardContent>
      </Card>
    </>
  );
}

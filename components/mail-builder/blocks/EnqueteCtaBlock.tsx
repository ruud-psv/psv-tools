"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function EnqueteCtaBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Enquête CTA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="enqueteCtaLabel">Knoptekst</Label>
          <Input
            id="enqueteCtaLabel"
            placeholder="NAAR HET ONDERZOEK"
            value={state.enqueteCtaLabel ?? ""}
            onChange={(e) => onChange({ enqueteCtaLabel: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="enqueteCtaUrl">Knop-link</Label>
          <Input
            id="enqueteCtaUrl"
            placeholder="https://…"
            value={state.enqueteCtaUrl ?? ""}
            onChange={(e) => onChange({ enqueteCtaUrl: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="enqueteCtaSubtext">Subtekst onder knop</Label>
          <Input
            id="enqueteCtaSubtext"
            placeholder="Het invullen kost een paar minuten…"
            value={state.enqueteCtaSubtext ?? ""}
            onChange={(e) => onChange({ enqueteCtaSubtext: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="enqueteHeeftSecImage"
            type="checkbox"
            checked={state.enqueteHeeftSecImage ?? false}
            onChange={(e) => onChange({ enqueteHeeftSecImage: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="enqueteHeeftSecImage">Extra afbeelding tonen</Label>
        </div>
        {state.enqueteHeeftSecImage && (
          <>
            <div className="space-y-2">
              <Label htmlFor="enqueteSecImageUrl">Afbeelding URL</Label>
              <div className="flex gap-2">
                <Input
                  id="enqueteSecImageUrl"
                  placeholder="https://images.maileon-static.com/c/…"
                  value={state.enqueteSecImagePreviewUrl ?? ""}
                  onChange={(e) => onChange({ enqueteSecImagePreviewUrl: e.target.value })}
                  className="flex-1 min-w-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={uploadingField !== null}
                  onClick={() => triggerUpload("enquete-sec", (url) => onChange({ enqueteSecImagePreviewUrl: url }))}
                >
                  {uploadingField === "enquete-sec" ? <span className="text-xs">…</span> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="enqueteSecImageAlt">Alt-tekst</Label>
              <Input
                id="enqueteSecImageAlt"
                placeholder="Alt-tekst afbeelding"
                value={state.enqueteSecImageAlt ?? ""}
                onChange={(e) => onChange({ enqueteSecImageAlt: e.target.value })}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function HeroBlock({ state, onChange, triggerUpload, uploadingField, uploadError }: BlockProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Hero afbeelding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="heroPreviewUrl">Afbeelding</Label>
          <div className="flex gap-2">
            <Input
              id="heroPreviewUrl"
              placeholder="https://images.maileon-static.com/c/…"
              value={state.heroPreviewUrl}
              onChange={(e) => onChange({ heroPreviewUrl: e.target.value })}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={uploadingField !== null}
              onClick={() => triggerUpload("hero", (url) => onChange({ heroPreviewUrl: url }))}
            >
              <Upload className="h-4 w-4" />
              {uploadingField === "hero" ? "Uploaden…" : "Upload"}
            </Button>
          </div>
          {uploadError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {uploadError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Upload naar Bunny CDN, of plak een bestaande URL. Export-URL wordt automatisch afgeleid.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="heroAlt">Alt-tekst</Label>
          <Input
            id="heroAlt"
            placeholder="Scoor nu je tickets"
            value={state.heroAlt}
            onChange={(e) => onChange({ heroAlt: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="heroLink">Klik-link (optioneel)</Label>
          <Input
            id="heroLink"
            placeholder="https://ticketshop.psv.nl/…"
            value={state.heroLink}
            onChange={(e) => onChange({ heroLink: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

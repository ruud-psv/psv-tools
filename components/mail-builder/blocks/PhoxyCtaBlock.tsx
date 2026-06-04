"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function PhoxyCtaBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Phoxy CTA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phoxyCtaImageUrl">CTA afbeelding</Label>
          <div className="flex gap-2">
            <Input
              id="phoxyCtaImageUrl"
              placeholder="https://images.maileon-static.com/c/…"
              value={state.phoxyCtaImagePreviewUrl ?? ""}
              onChange={(e) => onChange({ phoxyCtaImagePreviewUrl: e.target.value })}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={uploadingField !== null}
              onClick={() => triggerUpload("phoxy-cta-img", (url) => onChange({ phoxyCtaImagePreviewUrl: url }))}
            >
              {uploadingField === "phoxy-cta-img" ? <span className="text-xs">…</span> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Afbeelding-knop (60% breedte, links uitgelijnd).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phoxyCtaUrl">CTA link</Label>
          <Input
            id="phoxyCtaUrl"
            placeholder="https://…"
            value={state.phoxyCtaUrl ?? ""}
            onChange={(e) => onChange({ phoxyCtaUrl: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

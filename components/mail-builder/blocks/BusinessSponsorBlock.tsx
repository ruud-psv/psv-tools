"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function BusinessSponsorBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Sponsor-balk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="businessSponsorUrl">Afbeelding</Label>
          <div className="flex gap-2">
            <Input
              id="businessSponsorUrl"
              placeholder="https://…"
              value={state.businessSponsorPreviewUrl}
              onChange={(e) => onChange({ businessSponsorPreviewUrl: e.target.value })}
              className="flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={uploadingField !== null}
              onClick={() => triggerUpload("biz-sponsor", (url) => onChange({ businessSponsorPreviewUrl: url }))}
            >
              {uploadingField === "biz-sponsor" ? <span className="text-xs">…</span> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Seizoensgebonden sponsorbalk. Export-URL wordt automatisch afgeleid.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

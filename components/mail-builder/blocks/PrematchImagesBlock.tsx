"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { newPrematchImage } from "@/components/mail-builder-form";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function PrematchImagesBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Afbeeldingen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.prematchImages.map((img, i) => (
          <div key={img.id} className="rounded-md border border-input bg-card p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Afbeelding {i + 1}</span>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    prematchImages: state.prematchImages.filter((_, j) => j !== i),
                  })
                }
                className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Verwijder afbeelding"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="https://…"
                value={img.previewUrl}
                onChange={(e) =>
                  onChange({
                    prematchImages: state.prematchImages.map((it, j) =>
                      j === i ? { ...it, previewUrl: e.target.value } : it
                    ),
                  })
                }
                className="h-8 text-xs flex-1 min-w-0"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 h-8 px-2"
                disabled={uploadingField !== null}
                onClick={() =>
                  triggerUpload(`pm-${i}`, (url) =>
                    onChange({
                      prematchImages: state.prematchImages.map((it, j) =>
                        j === i ? { ...it, previewUrl: url } : it
                      ),
                    })
                  )
                }
              >
                {uploadingField === `pm-${i}` ? (
                  <span className="text-xs">…</span>
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <Input
              placeholder="Alt-tekst"
              value={img.alt}
              onChange={(e) =>
                onChange({
                  prematchImages: state.prematchImages.map((it, j) =>
                    j === i ? { ...it, alt: e.target.value } : it
                  ),
                })
              }
              className="h-8 text-xs"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            onChange({ prematchImages: [...state.prematchImages, newPrematchImage()] })
          }
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Afbeelding toevoegen
        </button>

        <div className="pt-1 border-t border-border space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Footer</span>
          <div className="flex gap-2">
            <Input
              placeholder="https://…"
              value={state.prematchFooterPreviewUrl}
              onChange={(e) => onChange({ prematchFooterPreviewUrl: e.target.value })}
              className="h-8 text-xs flex-1 min-w-0"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 h-8 px-2"
              disabled={uploadingField !== null}
              onClick={() =>
                triggerUpload("pm-footer", (url) => onChange({ prematchFooterPreviewUrl: url }))
              }
            >
              {uploadingField === "pm-footer" ? (
                <span className="text-xs">…</span>
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Input
            placeholder="Alt-tekst footer"
            value={state.prematchFooterAlt}
            onChange={(e) => onChange({ prematchFooterAlt: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}

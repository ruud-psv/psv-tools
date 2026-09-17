"use client";

import { useRef } from "react";
import { GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard } from "@/components/mail-builder/shared/collapsible-card";
import { cn } from "@/lib/utils";
import {
  RichTextEditor,
  Toggle,
  PREMATCH_BG_CONFIG,
  newPrematchBlock,
  type PrematchBg,
  type PrematchBlock,
} from "@/components/mail-builder-form";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

const BG_KEYS: PrematchBg[] = ["wit", "lichtgrijs", "grijs", "zwart"];

export function PrematchBlocksBlock({ state, onChange, triggerUpload, uploadingField }: BlockProps) {
  const dragIndex = useRef<number | null>(null);
  const blocks = state.prematchBlocks;

  function updateBlock<K extends keyof PrematchBlock>(i: number, key: K, value: PrematchBlock[K]) {
    const next = [...blocks];
    next[i] = { ...next[i], [key]: value };
    onChange({ prematchBlocks: next });
  }

  function addBlock(type: PrematchBlock["type"]) {
    const block =
      type === "banmail"
        ? newPrematchBlock({ type: "banmail", bg: "grijs", heeftCta: false, titel: "", tekst: "" })
        : newPrematchBlock({ type: "content" });
    onChange({ prematchBlocks: [...blocks, block] });
  }

  function removeBlock(i: number) {
    onChange({ prematchBlocks: blocks.filter((_, idx) => idx !== i) });
  }

  function moveBlock(from: number, to: number) {
    if (from === to) return;
    const next = [...blocks];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange({ prematchBlocks: next });
  }

  return (
    <CollapsibleCard title="Pre-match blokken" contentClassName="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Knop onder de header</Label>
            <Toggle
              checked={state.prematchHeeftCta}
              onChange={(v) => onChange({ prematchHeeftCta: v })}
            />
          </div>
          {state.prematchHeeftCta && (
            <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
              <Input
                placeholder="ALLES OVER PSV - SPARTA ROTTERDAM"
                value={state.prematchCtaLabel}
                onChange={(e) => onChange({ prematchCtaLabel: e.target.value })}
                className="h-8 text-xs"
              />
              <Input
                placeholder="https://www.psv.nl/…"
                value={state.prematchCtaUrl}
                onChange={(e) => onChange({ prematchCtaUrl: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Staat direct onder het headerbeeld, op zwart. Het beeld zelf stel je in bij Hero afbeelding.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Blokken</Label>
          <div className="space-y-3">
            {blocks.map((block, i) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => { dragIndex.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex.current !== null) moveBlock(dragIndex.current, i); dragIndex.current = null; }}
                className="rounded-md border border-input bg-card p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                  <span className="font-heading text-xs uppercase tracking-wide">
                    {block.type === "content" ? "Content" : "Banmail"}
                  </span>
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {BG_KEYS.map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        title={PREMATCH_BG_CONFIG[bg].label}
                        onClick={() => updateBlock(i, "bg", bg)}
                        className={cn(
                          "h-5 w-5 rounded-sm border transition-all",
                          block.bg === bg
                            ? "border-primary ring-2 ring-primary ring-offset-1 scale-110"
                            : "border-input hover:border-primary/50"
                        )}
                        style={{ backgroundColor: PREMATCH_BG_CONFIG[bg].bg }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => removeBlock(i)}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Verwijder blok"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="https://…"
                    value={block.imageUrl}
                    onChange={(e) => updateBlock(i, "imageUrl", e.target.value)}
                    className="h-8 text-xs flex-1 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8 gap-1.5 px-2.5 text-xs"
                    disabled={uploadingField !== null}
                    onClick={() => triggerUpload(`pm-${block.id}`, (url) => updateBlock(i, "imageUrl", url))}
                  >
                    <Upload className="h-3.5 w-3.5" />{uploadingField === `pm-${block.id}` ? "Uploaden…" : "Upload"}
                  </Button>
                </div>
                <Input
                  placeholder="Alt-tekst"
                  value={block.imageAlt}
                  onChange={(e) => updateBlock(i, "imageAlt", e.target.value)}
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Klik-link (optioneel)"
                  value={block.imageLink}
                  onChange={(e) => updateBlock(i, "imageLink", e.target.value)}
                  className="h-8 text-xs"
                />

                {block.type === "content" && (
                  <>
                    <Input
                      placeholder="Bosz blikt vooruit"
                      value={block.titel}
                      onChange={(e) => updateBlock(i, "titel", e.target.value)}
                      className="h-8 text-xs font-medium"
                    />
                    <RichTextEditor
                      value={block.tekst}
                      onChange={(v) => updateBlock(i, "tekst", v)}
                      className="min-h-[70px]"
                    />
                    <p className="text-xs text-muted-foreground">⌘B vet · ⌘I cursief · ⌘U onderstreept</p>

                    <div className="space-y-2 border-t border-input pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">CTA-knop</span>
                        <Toggle checked={block.heeftCta} onChange={(v) => updateBlock(i, "heeftCta", v)} />
                      </div>
                      {block.heeftCta && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
                          <Input
                            placeholder="VOORBESCHOUWING PETER BOSZ"
                            value={block.ctaLabel}
                            onChange={(e) => updateBlock(i, "ctaLabel", e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Input
                            placeholder="https://www.psv.nl/…"
                            value={block.ctaUrl}
                            onChange={(e) => updateBlock(i, "ctaUrl", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addBlock("content")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Contentblok
              </button>
              <button
                type="button"
                onClick={() => addBlock("banmail")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Banmail
              </button>
            </div>
          </div>
        </div>

        <div className="pt-1 border-t border-border space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Footer-afbeelding</span>
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
              className="shrink-0 h-8 gap-1.5 px-2.5 text-xs"
              disabled={uploadingField !== null}
              onClick={() => triggerUpload("pm-footer", (url) => onChange({ prematchFooterPreviewUrl: url }))}
            >
              <Upload className="h-3.5 w-3.5" />{uploadingField === "pm-footer" ? "Uploaden…" : "Upload"}
            </Button>
          </div>
          <Input
            placeholder="Alt-tekst footer"
            value={state.prematchFooterAlt}
            onChange={(e) => onChange({ prematchFooterAlt: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </CollapsibleCard>
  );
}

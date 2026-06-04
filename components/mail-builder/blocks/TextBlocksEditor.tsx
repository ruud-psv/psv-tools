"use client";

import { useRef } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  RichTextEditor,
  Toggle,
  BLOCK_BG_CONFIG,
  newBlock,
  type BodyBlock,
  type MailBuilderState,
} from "@/components/mail-builder-form";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function TextBlocksEditor({ state, onChange }: Pick<BlockProps, "state" | "onChange">) {
  const aanhefInputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  function set<K extends keyof MailBuilderState>(key: K, value: MailBuilderState[K]) {
    onChange({ [key]: value } as Partial<MailBuilderState>);
  }

  function insertAanhefToken(token: string) {
    const el = aanhefInputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    set("aanhefText", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function updateBlock<K extends keyof BodyBlock>(i: number, key: K, value: BodyBlock[K]) {
    const next = [...state.blocks];
    next[i] = { ...next[i], [key]: value };
    onChange({ blocks: next });
  }

  function addBlock() {
    onChange({ blocks: [...state.blocks, newBlock()] });
  }

  function removeBlock(i: number) {
    onChange({ blocks: state.blocks.filter((_, idx) => idx !== i) });
  }

  function moveBlock(from: number, to: number) {
    if (from === to) return;
    const next = [...state.blocks];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange({ blocks: next });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Inhoud</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="aanhefText">Aanhef</Label>
          <Input
            ref={aanhefInputRef}
            id="aanhefText"
            placeholder="Hi {VOORNAAM}"
            value={state.aanhefText}
            onChange={(e) => set("aanhefText", e.target.value)}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => insertAanhefToken("{VOORNAAM}")}
              className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              + Voornaam
            </button>
            <button
              type="button"
              onClick={() => insertAanhefToken("{VOLLEDIGE NAAM}")}
              className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              + Volledige naam
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Klik op een knop om personalisatie in te voegen. Fallback is altijd <em>PSV-fan</em>.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Blokken</Label>
          <div className="space-y-3">
            {state.blocks.map((block, i) => (
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
                  <span className="text-xs font-medium text-muted-foreground">Blok {i + 1}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {(["wit", "grijs", "rood", "zwart"] as const).map((bg) => {
                      const cfg = BLOCK_BG_CONFIG[bg];
                      return (
                        <button
                          key={bg}
                          type="button"
                          title={bg.charAt(0).toUpperCase() + bg.slice(1)}
                          onClick={() => updateBlock(i, "blockBg", bg)}
                          className={cn(
                            "h-5 w-5 rounded-sm border transition-all",
                            block.blockBg === bg
                              ? "border-primary ring-2 ring-primary ring-offset-1 scale-110"
                              : "border-input hover:border-primary/50"
                          )}
                          style={{ backgroundColor: cfg.bg }}
                        />
                      );
                    })}
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

                <RichTextEditor
                  value={block.content}
                  onChange={(v) => updateBlock(i, "content", v)}
                  className="min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">
                  ⌘B vet · ⌘I cursief · ⌘U onderstreept
                  {!block.content && (
                    <span className="block mt-1">
                      Tip: gebruik de{" "}
                      <a
                        href="https://tools.psv.nl/dashboard/copy-generator"
                        target="_blank"
                        className="underline hover:text-foreground transition-colors"
                      >
                        Mail tekst generator
                      </a>{" "}
                      om body-tekst op te bouwen.
                    </span>
                  )}
                </p>

                <div className="space-y-2 border-t border-input pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">CTA-knop</span>
                    <Toggle checked={block.heeftCta} onChange={(v) => updateBlock(i, "heeftCta", v)} />
                  </div>
                  {block.heeftCta && (
                    <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
                      <Input
                        placeholder="SCOOR DE ALLERLAATSTE TICKETS"
                        value={block.ctaLabel}
                        onChange={(e) => updateBlock(i, "ctaLabel", e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="https://ticketshop.psv.nl/…"
                        value={block.ctaUrl}
                        onChange={(e) => updateBlock(i, "ctaUrl", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Secundaire link</span>
                    <Toggle checked={block.heeftSecLink} onChange={(v) => updateBlock(i, "heeftSecLink", v)} />
                  </div>
                  {block.heeftSecLink && (
                    <div className="space-y-1.5 pl-3 border-l-2 border-primary/20">
                      <Input
                        placeholder="Bekijk alle wedstrijden >"
                        value={block.secLinkLabel}
                        onChange={(e) => updateBlock(i, "secLinkLabel", e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="https://ticketshop.psv.nl/…"
                        value={block.secLinkUrl}
                        onChange={(e) => updateBlock(i, "secLinkUrl", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addBlock}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Blok toevoegen
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Afsluitende regel</Label>
            <Toggle
              checked={state.heeftAfsluitRegel}
              onChange={(v) => set("heeftAfsluitRegel", v)}
            />
          </div>
          {state.heeftAfsluitRegel && (
            <div className="pl-3 border-l-2 border-primary/20">
              <Input
                placeholder="Tot ziens in het Philips Stadion!"
                value={state.afsluitRegel}
                onChange={(e) => set("afsluitRegel", e.target.value)}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

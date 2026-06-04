"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function FooterBlock({ state, onChange }: Pick<BlockProps, "state" | "onChange">) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Footer</CardTitle>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="disclaimerTekst">Disclaimer-tekst</Label>
            <Textarea
              id="disclaimerTekst"
              value={state.disclaimerTekst}
              onChange={(e) => onChange({ disclaimerTekst: e.target.value })}
              className="min-h-[80px] text-xs"
            />
            <p className="text-xs text-muted-foreground">
              De zin &ldquo;Wil je er zeker van zijn…&rdquo; wordt altijd automatisch toegevoegd.
              {state.template === "business" && " De Business-contactregel en uitschrijflinks staan vast in het template."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="misNiksEmail">
              {state.template === "business"
                ? `"Mis niks" e-mailadres (PSV Business)`
                : `"Mis niks van PSV" e-mailadres`}
            </Label>
            <Input
              id="misNiksEmail"
              value={state.misNiksEmail}
              onChange={(e) => onChange({ misNiksEmail: e.target.value })}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

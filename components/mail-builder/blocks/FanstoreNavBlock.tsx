"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlockProps } from "@/components/mail-builder/shared/block-props";

export function FanstoreNavBlock({ state, onChange }: Pick<BlockProps, "state" | "onChange">) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>FANstore navigatie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          URLs voor de vier navigatieknoppen in de FANstore-balk.
        </p>
        <div className="space-y-2">
          <Label htmlFor="fsNavWedstrijd">Wedstrijd</Label>
          <Input
            id="fsNavWedstrijd"
            placeholder="https://www.psvfanstore.nl/wedstrijd"
            value={state.fanstoreNavWedstrijdUrl}
            onChange={(e) => onChange({ fanstoreNavWedstrijdUrl: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fsNavTraining">Training</Label>
          <Input
            id="fsNavTraining"
            placeholder="https://www.psvfanstore.nl/training"
            value={state.fanstoreNavTrainingUrl}
            onChange={(e) => onChange({ fanstoreNavTrainingUrl: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fsNavNieuw">Nieuw</Label>
          <Input
            id="fsNavNieuw"
            placeholder="https://www.psvfanstore.nl/nieuw"
            value={state.fanstoreNavNieuwUrl}
            onChange={(e) => onChange({ fanstoreNavNieuwUrl: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fsNavSale">Sale</Label>
          <Input
            id="fsNavSale"
            placeholder="https://www.psvfanstore.nl/sale"
            value={state.fanstoreNavSaleUrl}
            onChange={(e) => onChange({ fanstoreNavSaleUrl: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

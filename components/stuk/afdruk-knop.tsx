"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Afdrukken, of in het afdrukvenster "Opslaan als PDF" kiezen. */
export function AfdrukKnop() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer />
      Afdrukken of PDF
    </Button>
  );
}

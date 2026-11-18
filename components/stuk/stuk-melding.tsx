import type { ReactNode } from "react";

/** Een korte melding op een stukpagina, zoals een verlopen link. */
export function StukMelding({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md border-t-8 border-psv-red-primary bg-card p-6 shadow-sm">
        <h1 className="font-heading text-2xl uppercase">{titel}</h1>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
      </div>
    </main>
  );
}

import { GroepsfotoCreator } from "@/components/groepsfoto-creator";

export const metadata = {
  title: "Groepsfoto Creator | PSV Tools",
};

/**
 * Nog niet gekoppeld in de sidebar of op het dashboard (`lib/tools.ts`):
 * alleen bereikbaar via de URL, zolang het een prototype is.
 */
export default function GroepsfotoPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Groepsfoto Creator</h1>
        <p className="mt-1 text-muted-foreground">
          Zet jezelf op de foto met de spelers, voor een kerstkaart of een andere groepsfoto.
          Upload een selfie, kies een foto en download het resultaat als PNG.
        </p>
      </div>

      <GroepsfotoCreator />
    </div>
  );
}

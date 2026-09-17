import { KleurplaatCreator } from "@/components/kleurplaat-creator";

export const metadata = {
  title: "Kleurplaat Creator | PSV Tools",
};

export default function KleurplaatPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Kleurplaat Creator</h1>
        <p className="mt-1 text-muted-foreground">
          Maak een gepersonaliseerde kleurplaat met Phoxy in de hoofdrol. Upload een paar
          referenties, kies een scène en download het resultaat als PNG.
        </p>
      </div>

      <KleurplaatCreator />
    </div>
  );
}

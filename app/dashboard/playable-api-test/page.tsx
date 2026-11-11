import { PlayableApiTest } from "@/components/playable-api-test";

export const metadata = {
  title: "Playable API-test | PSV Tools",
};

// Beta tool: wie geen beta tools mag zien, stuurt de middleware terug naar het dashboard.
export default function PlayableApiTestPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Playable API-test</h1>
        <p className="mt-1 text-muted-foreground">
          Kan PSV Tools de HTML, CSS en JS van een campagnepagina zelf uit Playable halen, en mogen onze
          sleutels campagnes wijzigen of kopiëren? Vul een campagne in en je ziet het hier.
        </p>
      </div>

      <PlayableApiTest />
    </div>
  );
}

import { PlayableLoader } from "@/components/playable-loader";

export const metadata = {
  title: "Playable loader | PSV Tools",
};

// Beta tool: wie geen beta tools mag zien, stuurt de middleware terug naar het dashboard.
export default function PlayableLoaderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Playable loader</h1>
        <p className="mt-1 text-muted-foreground">
          Test: de code van een campagnepagina staat in PSV Tools en Playable laadt hem van Bunny. Zo hoeft
          niemand na een wijziging nog code in Playable te plakken.
        </p>
      </div>

      <PlayableLoader />
    </div>
  );
}

import { PlayableLoader } from "@/components/playable-loader";

export const metadata = {
  title: "Playable loader | PSV Tools",
};

// Beta tool: wie geen beta tools mag zien, stuurt de middleware terug naar het dashboard.
export default function PlayableLoaderPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Playable loader</h1>
        <p className="mt-1 text-muted-foreground">
          Pas een campagnepagina aan door te zeggen wat er anders moet. De pagina staat in PSV Tools en
          Playable laadt hem van Bunny, dus niemand hoeft nog code in Playable te plakken.
        </p>
      </div>

      <PlayableLoader />
    </div>
  );
}

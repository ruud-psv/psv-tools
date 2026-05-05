import { PlayableDashboard } from "@/components/playable-dashboard";

export const metadata = {
  title: "Landingspagina's | PSV Tools",
};

export default function LandingspaginasPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl mb-2">Landingspagina&apos;s</h1>
      <p className="text-muted-foreground mb-6">
        Inzicht in de prestaties van interactieve landingspagina&apos;s via Playable. Bekijk sessies,
        registraties en conversies per campagne.
      </p>
      <PlayableDashboard />
    </div>
  );
}

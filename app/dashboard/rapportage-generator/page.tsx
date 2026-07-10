import { RapportageGenerator } from "@/components/rapportage-generator-form";

export const metadata = {
  title: "Rapportage generator | PSV Tools",
};

export default function RapportageGeneratorPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Rapportage generator</h1>
      <p className="text-muted-foreground mb-6">
        Stel in een paar stappen een live rapportage samen. Kies per inzicht —
        DM Performance, Ticketing, Web verkeer en/of Fanstore — een eigen periode
        en de items die je wilt tonen, en deel een link die zichzelf automatisch
        ververst. Hieronder beheer je alle aangemaakte rapporten.
      </p>
      <RapportageGenerator />
    </div>
  );
}

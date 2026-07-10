import { RapportageGenerator } from "@/components/rapportage-generator-form";

export const metadata = {
  title: "Rapportage generator | PSV Tools",
};

export default function RapportageGeneratorPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Rapportage generator</h1>
      <p className="text-muted-foreground mb-6">
        Maak een live rapportage met een titel en korte introductie. Kies welke
        inzichten je wilt opnemen — DM Performance, Ticketing, Web verkeer en/of
        Fanstore — en deel een link die zichzelf elke 5 minuten ververst.
        Hieronder beheer je alle aangemaakte rapporten.
      </p>
      <RapportageGenerator />
    </div>
  );
}

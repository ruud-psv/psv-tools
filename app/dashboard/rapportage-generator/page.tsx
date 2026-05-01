import { RapportageGeneratorForm } from "@/components/rapportage-generator-form";

export const metadata = {
  title: "Rapportage generator | PSV Tools",
};

export default function RapportageGeneratorPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl mb-2">Rapportage generator</h1>
      <p className="text-muted-foreground mb-6">
        Maak een live rapportage van een specifieke campagne. Kies welke
        inzichten je wilt opnemen — DM Performance, Ticketing en/of Web verkeer
        — en deel een link die zichzelf elke 5 minuten ververst.
      </p>
      <RapportageGeneratorForm />
    </div>
  );
}

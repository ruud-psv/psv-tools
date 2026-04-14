import { RapportageGeneratorForm } from "@/components/rapportage-generator-form";

export const metadata = {
  title: "Rapportage generator | PSV Tools",
};

export default function RapportageGeneratorPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl mb-2">Rapportage generator</h1>
      <p className="text-muted-foreground mb-6">
        Upload een Excel bestand en Claude analyseert de data automatisch. Je
        krijgt een overzicht met KPI&apos;s, grafieken en concrete inzichten —
        ongeacht hoe het bestand is opgebouwd.
      </p>
      <RapportageGeneratorForm />
    </div>
  );
}

import { InstellingenForm } from "@/components/instellingen-form";

export const metadata = {
  title: "Instellingen | PSV Tools",
};

export default function InstellingenPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Instellingen</h1>
      <p className="text-muted-foreground mb-6">
        Beheer de API-sleutels en configuratie voor PSV Tools.
      </p>
      <InstellingenForm />
    </div>
  );
}

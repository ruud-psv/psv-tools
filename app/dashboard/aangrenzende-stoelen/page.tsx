import { AangrenzendeStoelen } from "@/components/aangrenzende-stoelen";

export const metadata = {
  title: "Aangrenzende stoelen | PSV Tools",
};

export default function AangrenzendeStoelenPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl">Aangrenzende stoelen</h1>
          <span className="tag">Beta</span>
          <span className="tag tag--gold">Ringside</span>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          Vlak voor een thuiswedstrijd zijn er soms nog losse stoelen vrij. Hier vind je de
          seizoenkaarthouders die ernaast zitten, zodat kaartverkoop ze kan benaderen voor een extra
          kaart. De export bevat alleen relatienummers, geen namen of e-mailadressen. De tool is nog
          in de testfase: controleer een lijst steekproefsgewijs voordat je hem gebruikt.
        </p>
      </div>
      <AangrenzendeStoelen />
    </div>
  );
}

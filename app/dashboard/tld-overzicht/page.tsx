import { TldOverzicht } from "@/components/tld-overzicht";
import { leesLaatsteScan } from "@/lib/tld-overzicht/store";

export const metadata = {
  title: "TLD overzicht | PSV Tools",
};

// Elke keer de laatste scan uit Blob lezen.
export const dynamic = "force-dynamic";

export default async function TldOverzichtPage() {
  let scan = null;
  let fout: string | null = null;
  try {
    scan = await leesLaatsteScan();
  } catch (err) {
    fout = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">TLD overzicht</h1>
      <p className="text-muted-foreground mb-6 max-w-3xl">
        Wat draait er op psv.nl, psv.com, psv.co.uk en alle andere topleveldomeinen? Een scan kijkt bij ruim 1.500
        domeinen wat er online staat en maakt een screenshot. Zo zie je wie de naam gebruikt en of iemand
        onze site namaakt voor phishing.
      </p>
      <TldOverzicht scan={scan} fout={fout} />
    </div>
  );
}

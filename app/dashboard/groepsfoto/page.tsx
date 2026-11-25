import { GroepsfotoCampagnes } from "@/components/groepsfoto-campagnes";
import { GroepsfotoCreator } from "@/components/groepsfoto-creator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = {
  title: "Groepsfoto Creator | PSV Tools",
};

/**
 * Nog niet gekoppeld in de sidebar of op het dashboard (`lib/tools.ts`):
 * alleen bereikbaar via de URL, zolang het een prototype is.
 */
export default function GroepsfotoPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Groepsfoto Creator</h1>
        <p className="mt-1 text-muted-foreground">
          Neem de plek in van één speler op de foto, voor een kerstkaart of een andere groepsfoto.
          Upload een selfie, kies een foto en download het resultaat als PNG.
        </p>
      </div>

      <Tabs defaultValue="maken">
        <TabsList className="mb-6">
          <TabsTrigger value="maken">Maken</TabsTrigger>
          <TabsTrigger value="campagnes">Campagnes</TabsTrigger>
        </TabsList>
        <TabsContent value="maken">
          <GroepsfotoCreator />
        </TabsContent>
        <TabsContent value="campagnes">
          <GroepsfotoCampagnes />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { BeheerTabs, type BeheerTab } from "@/components/beheer-tabs";

export const metadata = {
  title: "Beheer | PSV Tools",
};

// Alleen admins komen hier: de middleware stuurt de rest terug naar het dashboard.
export default async function BeheerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab: BeheerTab = tab === "mcp" || tab === "modellen" || tab === "crons" ? tab : "gebruikers";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">Beheer</h1>
        <p className="mt-1 text-muted-foreground">
          Bepaal per collega welke pagina&apos;s zichtbaar zijn, en welke MCP-servers de assistent mag
          gebruiken, welk AI-model elke plek gebruikt en welke crons er draaien.
        </p>
      </div>

      <BeheerTabs initialTab={initialTab} />
    </div>
  );
}

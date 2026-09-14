import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RingsideMatchSales } from "@/components/ringside-match-sales";

export const metadata = {
  title: "Wedstrijdverkoop | PSV Tools",
};

export default function WedstrijdverkoopPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl">Wedstrijdverkoop</h1>
            <span className="tag tag--gold">Ringside</span>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Zoek een wedstrijd en zie de verkoop per dag, afgezet tegen het aantal dagen tot de
            aftrap. Leg er andere wedstrijden naast om het verloop te vergelijken — dezelfde
            tegenstander vorig seizoen, of een willekeurige andere thuiswedstrijd. De cijfers komen
            uit de verkoopregels in Ringside, dus ook wedstrijden die al gespeeld zijn blijven
            beschikbaar.
          </p>
        </div>
        <Link
          href="/dashboard/ticket-inzichten"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Huidige pagina
        </Link>
      </div>
      <RingsideMatchSales />
    </div>
  );
}

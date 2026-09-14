import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketInzichtenDashboard } from "@/components/ticket-inzichten-dashboard";

export const metadata = {
  title: "Ticket Inzichten (Ringside) | PSV Tools",
};

export default function TicketInzichtenNewPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl">Ticket Inzichten</h1>
            <span className="tag tag--gold">Ringside</span>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Dezelfde opzet als de bestaande pagina, maar gevoed vanuit de Ringside API van
            SeatGeek in plaats van de XML-feed. Capaciteit komt uit de stoelindeling en verkoop
            uit de verkoopregels, dus de aantallen worden hier berekend en niet kant-en-klaar
            aangeleverd. Leg beide pagina&apos;s naast elkaar om te zien of ze overeenkomen.
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
      <TicketInzichtenDashboard feedUrl="/api/ringside/ticket-feed" />
    </div>
  );
}

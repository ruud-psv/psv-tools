import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketInzichtenDashboard } from "@/components/ticket-inzichten-dashboard";

export const metadata = {
  title: "Ticket Inzichten (Ringside) | PSV Tools",
};

/**
 * Ringside kan niet filteren op event, dus de feed leest een begrensd aantal
 * pagina's. Met `?pages=` en `?limit=` in de adresbalk is dat vanaf de pagina
 * zelf op te rekken — nodig zolang we nog uitzoeken hoe groot de tabellen zijn
 * en of de capaciteit klopt met de werkelijke venue.
 */
function buildFeedUrl(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const key of ["pages", "limit"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }
  const suffix = query.toString();
  return suffix ? `/api/ringside/ticket-feed?${suffix}` : "/api/ringside/ticket-feed";
}

export default async function TicketInzichtenNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedUrl = buildFeedUrl(await searchParams);

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
          <p className="text-muted-foreground text-sm mt-2 max-w-3xl">
            Staat er een melding dat de meting onvolledig is, zet dan{" "}
            <code className="text-xs">?pages=20</code> achter de URL om verder te laten lezen.
            Dat duurt langer maar levert hogere aantallen op.
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
      <TicketInzichtenDashboard feedUrl={feedUrl} />
    </div>
  );
}

import Link from "next/link";
import { Database } from "lucide-react";
import { TicketInzichtenDashboard } from "@/components/ticket-inzichten-dashboard";

export const metadata = {
  title: "Ticket Inzichten | PSV Tools",
};

export default function TicketInzichtenPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl mb-2">Ticket Inzichten</h1>
          <p className="text-muted-foreground">
            Real-time beschikbaarheid van tickets voor wedstrijden, tours, museum en andere evenementen. Vernieuwt automatisch elke 30 seconden. Verkoop per dag wordt opgebouwd uit metingen elke 2 uur.
          </p>
        </div>
        <Link
          href="/dashboard/ticket-inzichten/upload"
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <Database className="h-3.5 w-3.5" />
          Historische data
        </Link>
      </div>
      <TicketInzichtenDashboard />
    </div>
  );
}

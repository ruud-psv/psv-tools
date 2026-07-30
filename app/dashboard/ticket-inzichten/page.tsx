import { TicketInzichtenDashboard } from "@/components/ticket-inzichten-dashboard";

export const metadata = {
  title: "Ticket Inzichten | PSV Tools",
};

export default function TicketInzichtenPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Ticket Inzichten</h1>
      <p className="text-muted-foreground mb-6">
        Real-time beschikbaarheid van tickets voor wedstrijden, tours, museum en andere evenementen. Vernieuwt automatisch elke 30 seconden. Verkoop per dag wordt opgebouwd uit metingen elke 2 uur.
      </p>
      <TicketInzichtenDashboard />
    </div>
  );
}

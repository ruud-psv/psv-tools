import { TicketingHerdgang } from "@/components/ticketing-herdgang";

export const metadata = {
  title: "Ticketing Herdgang | PSV Tools",
};

export default function TicketingHerdgangPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl">Ticketing Herdgang</h1>
          <span className="tag">Beta</span>
          <span className="tag tag--gold">Ringside</span>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          De bezetting van thuiswedstrijden van Jong PSV en PSV Vrouwen op De Herdgang, per vak. De Herdgang
          heeft alleen staanvakken: per vak zie je de capaciteit, hoeveel tickets er verkocht zijn en hoeveel er
          nog vrij is. De tool is nog in de testfase: vergelijk de cijfers met de ticketshop voordat je ze gebruikt.
        </p>
      </div>
      <TicketingHerdgang />
    </div>
  );
}

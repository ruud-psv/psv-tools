import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { TicketingStadion } from "@/components/ticketing-stadion";

export const metadata = {
  title: "Ticketing Stadion | PSV Tools",
};

export default function TicketingStadionPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-3xl">Ticketing Stadion</h1>
          <span className="tag tag--gold">Ringside</span>
        </div>
        <p className="text-muted-foreground max-w-3xl">
          De komende thuiswedstrijden van PSV in het Philips Stadion: hoe vol het stadion zit, hoe snel de verkoop
          gaat en hoe dat zich verhoudt tot eerdere thuiswedstrijden. De tool is nog in de testfase: vergelijk de
          cijfers met de ticketshop voordat je ze gebruikt.
        </p>
        <Link
          href="/dashboard/ticketing-stadion/instroom"
          className="btn btn--medium btn--outlined mt-4 inline-flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <DoorOpen className="h-4 w-4" />
          Instroom van een gespeelde wedstrijd
        </Link>
      </div>
      <TicketingStadion />
    </div>
  );
}

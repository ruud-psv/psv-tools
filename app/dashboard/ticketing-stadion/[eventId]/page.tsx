import { TicketingStadionMatch } from "@/components/ticketing-stadion-match";

export const metadata = {
  title: "Ticketing Stadion | PSV Tools",
};

export default async function TicketingStadionMatchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <TicketingStadionMatch eventId={eventId} />
    </div>
  );
}

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TicketingStadionMatch } from "@/components/ticketing-stadion-match";

/**
 * De wedstrijdpagina van Ticketing Stadion via een deellink, zonder login. Het
 * token in de link bepaalt welke wedstrijd; zie `lib/ticketing-stadion/share.ts`.
 */
function SharedMatch() {
  const token = useSearchParams().get("token") ?? "";
  if (!token) {
    return <p className="text-sm text-muted-foreground">Deze link is ongeldig.</p>;
  }
  return <TicketingStadionMatch shareToken={token} />;
}

export default function SharedStadionPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Suspense fallback={null}>
        <SharedMatch />
      </Suspense>
    </div>
  );
}

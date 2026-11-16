"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { StadionSeizoen } from "@/components/stadion-seizoen";

/**
 * Het seizoensoverzicht van Ticketing Stadion via een deellink, zonder login.
 * Het token in de link bepaalt het seizoen en welke wedstrijden meetellen.
 */
function SharedSeason() {
  const token = useSearchParams().get("token") ?? "";
  if (!token) {
    return <p className="text-sm text-muted-foreground">Deze link is ongeldig.</p>;
  }
  return <StadionSeizoen shareToken={token} />;
}

export default function SharedStadionSeizoenPage() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Suspense fallback={null}>
        <SharedSeason />
      </Suspense>
    </div>
  );
}

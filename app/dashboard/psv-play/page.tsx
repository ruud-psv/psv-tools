import { PsvPlayDashboard } from "@/components/psv-play/psv-play-dashboard";

export const metadata = {
  title: "PSV Play | PSV Tools",
};

export default function PsvPlayPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">PSV Play</h1>
      <p className="text-muted-foreground mb-6">
        Kijkcijfers van PSV Play, de video&apos;s in Mijn PSV+, via JW Player. Kijktijd is de belangrijkste maat; daarnaast
        unieke kijkers, plays, de best bekeken video&apos;s, live-uitzendingen en het publiek.
      </p>
      <PsvPlayDashboard />
    </div>
  );
}

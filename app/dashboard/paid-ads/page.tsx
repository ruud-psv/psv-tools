import { PaidAdsDashboard } from "@/components/paid-ads/paid-ads-dashboard";

export const metadata = {
  title: "Paid Ads | PSV Tools",
};

export default function PaidAdsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Paid Ads</h1>
      <p className="text-muted-foreground mb-6">
        Prestaties van betaalde campagnes op Meta, TikTok, Google Ads en LinkedIn — opgesplitst
        naar de fases bereik, verkeer en conversie. Kies een periode en vergelijk met de vorige
        periode, vorig jaar of de doelstelling.
      </p>
      <PaidAdsDashboard />
    </div>
  );
}

import { PaidAdsDashboard } from "@/components/paid-ads/paid-ads-dashboard";

export const metadata = {
  title: "Paid Ads | PSV Tools",
};

export default function PaidAdsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Paid Ads</h1>
      <p className="text-muted-foreground mb-6">
        Wat de betaalde campagnes op Meta, TikTok, Google Ads en LinkedIn kosten, wat ze opleveren
        en wat de creatives doen. Stel je vraag in gewone taal, of kijk onder de andere tabbladen
        voor alle details.
      </p>
      <PaidAdsDashboard />
    </div>
  );
}

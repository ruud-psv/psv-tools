import { DmPerformanceDashboard } from "@/components/dm-performance-dashboard";

export const metadata = {
  title: "DM Performance | PSV Tools",
};

export default function DmPerformancePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">DM Performance</h1>
      <p className="text-muted-foreground mb-6">
        Inzicht in de prestaties van direct mailings via Maileon. Bekijk open
        rates, click rates en andere KPI&apos;s per mailing.
      </p>
      <DmPerformanceDashboard />
    </div>
  );
}

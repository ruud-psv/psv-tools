import { DashboardOverview } from "@/components/dashboard-overview";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-heading uppercase tracking-tight">
          Dashboard
        </h1>
        <p className="mt-1 text-muted-foreground">
          Overzicht van tickets en e-mail performance.
        </p>
      </div>
      <DashboardOverview />
    </div>
  );
}

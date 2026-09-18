import { DatabaseDashboard } from "@/components/database/database-dashboard";

export const metadata = {
  title: "Database | PSV Tools",
};

export default function DatabasePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl mb-2">Database</h1>
      <p className="text-muted-foreground mb-6">
        De SSO-database als bron, en campagnes ertegen afgezet: hoeveel deelnemers waren
        een nieuw record en hoeveel kenden we al. Plus wat campagnes onderling delen.
      </p>
      <DatabaseDashboard />
    </div>
  );
}

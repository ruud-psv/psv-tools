import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { firstNameFrom, greetingFor } from "@/lib/greeting";
import { DashboardEntries } from "@/components/dashboard-entries";
import { DashboardOverview } from "@/components/dashboard-overview";

// De begroeting leest de sessiecookie, dus de pagina mag niet statisch worden
// voorgerenderd — anders staat er bij iedereen dezelfde naam en hetzelfde
// dagdeel.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const token = (await cookies()).get("psv_session")?.value;
  const session = token ? verifySession(token) : null;
  const firstName = firstNameFrom(session);
  const greeting = greetingFor();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-10">
        <h1 className="font-heading text-4xl uppercase tracking-tight sm:text-5xl">
          {greeting}
          {firstName && (
            <>
              {" "}
              <span className="text-psv-red-primary">{firstName}</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Waar kan Tools je mee helpen?
        </p>
      </header>

      <DashboardEntries />

      <div className="mt-12 border-t border-border pt-10">
        <DashboardOverview />
      </div>
    </div>
  );
}

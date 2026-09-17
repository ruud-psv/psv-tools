import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { firstNameFrom, greetingFor } from "@/lib/greeting";
import { DashboardEntries } from "@/components/dashboard-entries";

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
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      {/* my-auto in plaats van justify-center: centreert verticaal zolang er
          ruimte over is, maar knipt de bovenkant niet af zodra de kaarten op
          een klein scherm toch langer worden dan het venster. */}
      <div className="mx-auto my-auto w-full max-w-5xl">
        <header className="mb-10 text-center">
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
      </div>
    </div>
  );
}

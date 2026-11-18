import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getAccess } from "@/lib/access-store";
import { firstNameFrom, greetingFor } from "@/lib/greeting";
import { DashboardEntries } from "@/components/dashboard-entries";
import { DashboardChat } from "@/components/dashboard-chat";
import { ASSISTENT_HREF } from "@/lib/assistent-start";

// De begroeting leest de sessiecookie, dus de pagina mag niet statisch worden
// voorgerenderd — anders staat er bij iedereen dezelfde naam en hetzelfde
// dagdeel.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = (await cookies()).get("psv_session")?.value;
  const session = token ? verifySession(token) : null;
  const access = session ? await getAccess(session.email) : null;
  // De middleware stuurt je hierheen als je een pagina opent waar je geen recht op hebt.
  const noAccess = (await searchParams)["geen-toegang"] !== undefined;
  const firstName = firstNameFrom(session);
  const greeting = greetingFor();

  const pages = access?.pages ?? [];
  const metAssistent = pages.includes(ASSISTENT_HREF);

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6 lg:p-8">
      {/* my-auto in plaats van justify-center: centreert verticaal zolang er
          ruimte over is, maar knipt de bovenkant niet af zodra de inhoud op
          een klein scherm toch langer wordt dan het venster. */}
      <div className="mx-auto my-auto w-full max-w-5xl">
        {noAccess && (
          <div className="alert alert--warning mx-auto mb-6 max-w-3xl" role="alert">
            Je hebt geen toegang tot die pagina. Vraag een admin om je toegang te geven.
          </div>
        )}

        {metAssistent ? (
          <DashboardChat greeting={greeting} firstName={firstName} />
        ) : (
          // Zonder toegang tot de assistent: de tools als kaarten, zoals voorheen.
          <>
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
              <p className="mt-2 text-lg text-muted-foreground">Waar kan Tools je mee helpen?</p>
            </header>
            <DashboardEntries allowedPages={pages} />
          </>
        )}
      </div>
    </div>
  );
}

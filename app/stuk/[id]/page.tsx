import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getStuk } from "@/lib/stukken/store";
import { AfdrukKnop } from "@/components/stuk/afdruk-knop";
import { StukMelding } from "@/components/stuk/stuk-melding";
import { StukVoorbeeld } from "@/components/stuk/deck-weergave";

/**
 * Het stuk op een eigen pagina, zonder de rest van PSV Tools eromheen, om af
 * te drukken of als PDF op te slaan. Alleen voor de maker; de middleware
 * stuurt wie niet is ingelogd naar het inlogscherm.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stuk | PSV Tools",
  robots: { index: false, follow: false },
};

export default async function StukPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await cookies()).get("psv_session")?.value;
  const sessie = cookie ? verifySession(cookie) : null;
  const stuk = sessie ? await getStuk(sessie.email, id).catch(() => null) : null;
  if (!stuk) {
    return (
      <StukMelding titel="Stuk niet gevonden">
        <p>Dit stuk bestaat niet, of is van een ander account.</p>
        <p>
          <Link href="/dashboard/assistent" className="btn btn--medium">
            Naar de assistent
          </Link>
        </p>
      </StukMelding>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8 print:p-0">
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/assistent" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug naar de assistent
        </Link>
        <AfdrukKnop />
      </div>
      <StukVoorbeeld stuk={stuk} peildatum={stuk.peildatum} />
    </main>
  );
}

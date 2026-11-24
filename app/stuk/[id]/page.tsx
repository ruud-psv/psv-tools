import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { readRegister } from "@/lib/gebruikers-register";
import { magLezen } from "@/lib/stukken/collegas";
import { eigenaarHash, getStuk, getStukVanEigenaar } from "@/lib/stukken/store";
import { AfdrukKnop } from "@/components/stuk/afdruk-knop";
import { PresenteerKnop } from "@/components/stuk/presentatie";
import { StukMelding } from "@/components/stuk/stuk-melding";
import { StukVoorbeeld } from "@/components/stuk/deck-weergave";

/**
 * Het stuk op een eigen pagina, zonder de rest van PSV Tools eromheen, om af
 * te drukken of als PDF op te slaan. Voor de maker, en met `?van=<hash van de
 * eigenaar>` voor collega's met wie het gedeeld is (alleen lezen, altijd de
 * nieuwste versie). De middleware stuurt wie niet is ingelogd naar het
 * inlogscherm.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stuk | PSV Tools",
  robots: { index: false, follow: false },
};

export default async function StukPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ van?: string | string[] }>;
}) {
  const { id } = await params;
  const { van } = await searchParams;
  const cookie = (await cookies()).get("psv_session")?.value;
  const sessie = cookie ? verifySession(cookie) : null;
  const vanCollega = sessie && typeof van === "string" && van !== eigenaarHash(sessie.email) ? van : null;
  const gevonden = !sessie
    ? null
    : vanCollega
    ? await getStukVanEigenaar(vanCollega, id).catch(() => null)
    : await getStuk(sessie.email, id).catch(() => null);
  // Van een collega: alleen als het (nog) met jou gedeeld is.
  const stuk = gevonden && sessie && magLezen(gevonden, sessie.email) ? gevonden : null;
  if (!stuk) {
    return (
      <StukMelding titel="Stuk niet gevonden">
        <p>Dit stuk bestaat niet, of is niet (meer) met jou gedeeld.</p>
        <p>
          <Link href="/dashboard/assistent/documenten" className="btn btn--medium">
            Naar mijn documenten
          </Link>
        </p>
      </StukMelding>
    );
  }
  const gedeeldDoor = vanCollega
    ? (await readRegister()).find((c) => c.email === stuk.eigenaar.toLowerCase())?.naam ?? stuk.eigenaar
    : null;

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8 print:p-0">
      <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="space-y-0.5">
          <Link href="/dashboard/assistent/documenten" className="text-sm text-muted-foreground hover:text-foreground">
            ← Naar mijn documenten
          </Link>
          {gedeeldDoor && <p className="text-xs text-muted-foreground">Gedeeld door {gedeeldDoor} · alleen lezen</p>}
        </div>
        <div className="flex gap-2">
          <PresenteerKnop stuk={stuk} />
          <AfdrukKnop />
        </div>
      </div>
      <StukVoorbeeld stuk={stuk} peildatum={stuk.peildatum} />
    </main>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { todayInAmsterdam } from "@/lib/ringside/seat-state";
import { deelToegang } from "@/lib/stukken/delen";
import { getDeelRecord } from "@/lib/stukken/store";
import { AfdrukKnop } from "@/components/stuk/afdruk-knop";
import { StukMelding } from "@/components/stuk/stuk-melding";
import { StukWeergave, formatDag } from "@/components/stuk/stuk-weergave";

/**
 * Een gedeeld stuk: de momentopname uit de deellink. Openbaar, of alleen voor
 * ingelogde collega's (de middleware laat /share/ door, dus deze pagina
 * controleert de sessie zelf). De titel staat bewust niet in de metadata:
 * een voorbeeld in Teams of Slack zou hem anders ook tonen voor een link die
 * alleen voor collega's is.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gedeeld stuk | PSV",
  robots: { index: false, follow: false },
};

export default async function GedeeldStukPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getDeelRecord(id).catch((err) => {
    console.error("[share/stuk] lezen mislukt:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!record) {
    return (
      <StukMelding titel="Link niet gevonden">
        <p>Deze link is ingetrokken of klopt niet. Vraag de maker om een nieuwe.</p>
      </StukMelding>
    );
  }

  const sessie = (await cookies()).get("psv_session")?.value;
  const toegang = deelToegang(record, Boolean(sessie && verifySession(sessie)), todayInAmsterdam());
  if (toegang === "verlopen") {
    return (
      <StukMelding titel="Link verlopen">
        <p>Deze link werkte tot en met {formatDag(record.verlooptOp ?? "")}. Vraag de maker om een nieuwe.</p>
      </StukMelding>
    );
  }
  if (toegang === "inloggen") {
    return (
      <StukMelding titel="Alleen voor collega's">
        <p>Dit stuk is gedeeld met collega&apos;s van PSV. Log in met je PSV-account en open de link daarna opnieuw.</p>
        <p>
          <a href="/login" className="btn btn--medium">
            Inloggen
          </a>
        </p>
      </StukMelding>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8 print:p-0">
      <div className="mx-auto mb-4 flex max-w-4xl justify-end print:hidden">
        <AfdrukKnop />
      </div>
      <StukWeergave stuk={record.stuk} peildatum={record.stuk.peildatum} />
    </main>
  );
}

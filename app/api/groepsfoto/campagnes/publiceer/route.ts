import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { publiceerCampagne } from "@/lib/groepsfoto/campagne-opslag";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Zet de config en de basisfoto van een campagne in de privé opslag op Bunny. */
export async function POST(req: NextRequest) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  let body: { slug?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Kon de aanvraag niet lezen." }, { status: 400 });
  }
  if (typeof body.slug !== "string") {
    return NextResponse.json({ error: "Geen campagne opgegeven." }, { status: 400 });
  }

  try {
    return NextResponse.json({ campagne: await publiceerCampagne(body.slug, sessie.email) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Publiceren mislukt." },
      { status: 502 }
    );
  }
}

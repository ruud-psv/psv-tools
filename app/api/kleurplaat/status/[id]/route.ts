import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import type { StatusResponse } from "@/lib/kleurplaat";
import { eersteAfbeelding, haalVoorspelling } from "@/lib/kleurplaat/replicate";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie.error;

  const { id } = await params;
  if (!/^[a-z0-9]{6,64}$/i.test(id)) {
    return NextResponse.json({ error: "Ongeldig generatie-id." }, { status: 400 });
  }

  try {
    const voorspelling = await haalVoorspelling(id);
    const antwoord: StatusResponse = {
      status: voorspelling.status,
      imageUrl: voorspelling.status === "succeeded" ? eersteAfbeelding(voorspelling.output) : undefined,
      error: voorspelling.error ?? undefined,
      duur: voorspelling.metrics?.predict_time,
    };

    if (antwoord.status === "succeeded" && !antwoord.imageUrl) {
      antwoord.status = "failed";
      antwoord.error = "Het model leverde geen afbeelding op.";
    }

    return NextResponse.json(antwoord);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status opvragen mislukt." },
      { status: 502 }
    );
  }
}

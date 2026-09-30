import { NextRequest } from "next/server";
import { geefAfbeeldingDoor } from "@/lib/replicate/doorgeven";

export const runtime = "nodejs";

/** Haalt de gegenereerde groepsfoto op bij Replicate en geeft hem door. */
export async function GET(req: NextRequest) {
  return geefAfbeeldingDoor(req, "psv-groepsfoto");
}

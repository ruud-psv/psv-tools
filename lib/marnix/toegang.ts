import { NextRequest, NextResponse } from "next/server";

import { getAccess } from "@/lib/access-store";
import { requireEmail } from "@/lib/api-session";

/**
 * Voor de API's onder `/api/marnix`. De middleware laat ze al alleen door
 * voor admins (`TEST_API` in `lib/access.ts`); deze routes controleren het
 * nog een keer, omdat ze naar Maileon en Asana schrijven.
 */
export async function alleenAdmins(req: NextRequest): Promise<{ email: string } | { error: NextResponse }> {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie;
  if (!(await getAccess(sessie.email)).isAdmin) {
    return { error: NextResponse.json({ error: "Deze pagina is alleen voor admins." }, { status: 403 }) };
  }
  return { email: sessie.email };
}

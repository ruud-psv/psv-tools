import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { normalizeEmail, sanitizeUserAccess } from "@/lib/access";
import { adminEmails, getAccess, readUsers, writeUsers } from "@/lib/access-store";

/**
 * Gebruikersbeheer: de toegangslijst lezen en aanpassen. Alleen voor admins —
 * de middleware houdt de rest al tegen, maar deze route controleert het zelf
 * ook, zodat hij niet op de middleware hoeft te leunen.
 */
async function requireAdmin(req: NextRequest) {
  const session = requireEmail(req);
  if ("error" in session) return session;
  if (!(await getAccess(session.email)).isAdmin) {
    return { error: NextResponse.json({ error: "Alleen admins kunnen gebruikers beheren." }, { status: 403 }) };
  }
  return { email: normalizeEmail(session.email) };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  return NextResponse.json({
    users: await readUsers({ fresh: true }),
    adminEmails: adminEmails(),
    me: admin.email,
  });
}

/** Zet (of wijzig) het niveau van één gebruiker. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const input = sanitizeUserAccess(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Ongeldig e-mailadres of niveau." }, { status: 400 });
  }
  if (input.email === admin.email && input.level !== "admin") {
    return NextResponse.json({ error: "Je kunt je eigen admin-rechten niet intrekken." }, { status: 400 });
  }
  if (adminEmails().includes(input.email)) {
    return NextResponse.json(
      { error: "Dit adres staat in ADMIN_EMAILS en is altijd admin. Pas dat aan in Vercel." },
      { status: 400 }
    );
  }

  try {
    const users = (await readUsers({ fresh: true })).filter((u) => u.email !== input.email);
    users.push({ ...input, updatedAt: new Date().toISOString(), updatedBy: admin.email });
    await writeUsers(users);
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[gebruikersbeheer] Opslaan mislukt:", err);
    return NextResponse.json({ error: "Opslaan is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

/** Haalt iemand uit de lijst; die valt dan terug op het standaardniveau. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;

  const email = normalizeEmail(req.nextUrl.searchParams.get("email") ?? "");
  if (email === admin.email) {
    return NextResponse.json({ error: "Je kunt jezelf niet verwijderen." }, { status: 400 });
  }

  try {
    const users = (await readUsers({ fresh: true })).filter((u) => u.email !== email);
    await writeUsers(users);
    return NextResponse.json({ users });
  } catch (err) {
    console.error("[gebruikersbeheer] Verwijderen mislukt:", err);
    return NextResponse.json({ error: "Verwijderen is mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";
import { canAccessApi, canAccessPath } from "@/lib/access";
import { getAccess } from "@/lib/access-store";

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get("psv_session")?.value;
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === "/login";
  const isApiRoute = pathname.startsWith("/api/");
  const isShareRoute = pathname.startsWith("/share/");
  const isSamlRoute = pathname.startsWith("/saml/");

  if (isShareRoute || isSamlRoute) return NextResponse.next();

  const session = cookie ? verifySession(cookie) : null;

  // API-routes controleren de sessie zelf (en cron/webhooks hebben er geen).
  // Hier alleen: ingelogd, maar geen recht op de pagina waar de route bij hoort.
  if (isApiRoute) {
    if (session && !canAccessApi(await getAccess(session.email), pathname)) {
      return NextResponse.json({ error: "Je hebt geen toegang tot deze tool." }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (!session) {
    if (isLoginPage) return NextResponse.next();
    // Verlopen of ongeldige cookie meteen opruimen, anders stuurt /login je
    // terug naar het dashboard en blijf je rondgaan.
    const response = NextResponse.redirect(new URL("/login", request.url));
    if (cookie) response.cookies.delete("psv_session");
    return response;
  }

  if (isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!canAccessPath(await getAccess(session.email), pathname)) {
    const url = new URL("/dashboard", request.url);
    url.searchParams.set("geen-toegang", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Node.js-runtime: de sessie wordt met `crypto` geverifieerd en de
  // toegangslijst komt uit Vercel Blob.
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|images).*)",
  ],
};

import { NextRequest, NextResponse } from "next/server";
import { SAML } from "@node-saml/node-saml";
import { getSamlOptions } from "@/lib/saml-config";
import { createSessionToken } from "@/lib/auth";

/** Claim-namen waaronder Azure AD de voornaam kan meesturen. */
const GIVEN_NAME_CLAIMS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  "givenName",
  "given_name",
  "firstName",
];

/** Claim-namen met de volledige naam, als terugvalpad op de voornaam-claim. */
const FULL_NAME_CLAIMS = [
  "http://schemas.microsoft.com/identity/claims/displayname",
  "displayName",
  "cn",
];

function claim(profile: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!profile) return "";
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * De voornaam uit de SAML-assertion. Is er geen aparte voornaam-claim, dan
 * wordt hij uit de volledige naam afgeleid: "Ruud Dankers" en "Dankers, Ruud"
 * leveren allebei "Ruud" op.
 */
function firstNameFromProfile(profile: Record<string, unknown> | null | undefined): string {
  const given = claim(profile, GIVEN_NAME_CLAIMS);
  if (given) return given.split(/\s+/)[0];

  const full = claim(profile, FULL_NAME_CLAIMS);
  if (!full) return "";
  // "Achternaam, Voornaam" → alles na de komma.
  const [last, first] = full.split(",");
  const source = first?.trim() ? first.trim() : last.trim();
  return source.split(/\s+/)[0] ?? "";
}

export async function POST(request: NextRequest) {
  let rawSamlResponse: string | null = null;
  try {
    const text = await request.text();
    const body = new URLSearchParams(text);
    rawSamlResponse = body.get("SAMLResponse");
  } catch {
    return NextResponse.json({ error: "Ongeldige request body." }, { status: 400 });
  }

  if (!rawSamlResponse) {
    return NextResponse.json({ error: "Geen SAMLResponse ontvangen." }, { status: 400 });
  }

  const samlResponse = rawSamlResponse.replace(/ /g, "+");

  const saml = new SAML(await getSamlOptions());

  let email: string;
  let firstName = "";
  try {
    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    const nameId = profile?.nameID;
    const profileEmail = (profile as Record<string, unknown>)?.email as string | undefined;
    email = profileEmail ?? nameId ?? "";
    firstName = firstNameFromProfile(profile as Record<string, unknown> | null);

    if (!email || !email.includes("@")) {
      throw new Error(`Geen geldig e-mailadres in SAML assertion. nameID: ${nameId}`);
    }
  } catch (err) {
    console.error("[SAML callback] Validatie mislukt:", err);
    return NextResponse.redirect(new URL("/login?error=saml_validation_failed", request.url), { status: 302 });
  }

  const token = createSessionToken(email, firstName || undefined);
  const response = NextResponse.redirect(new URL("/dashboard", request.url), { status: 302 });
  response.cookies.set("psv_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 28800,
    path: "/",
  });
  return response;
}

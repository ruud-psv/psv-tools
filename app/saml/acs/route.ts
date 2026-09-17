import { NextRequest, NextResponse } from "next/server";
import { SAML } from "@node-saml/node-saml";
import { getSamlOptions } from "@/lib/saml-config";
import { createSessionToken } from "@/lib/auth";
import { fullNameFromProfile } from "@/lib/saml-name";

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
  let fullName = "";
  try {
    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    const nameId = profile?.nameID;
    const profileEmail = (profile as Record<string, unknown>)?.email as string | undefined;
    email = profileEmail ?? nameId ?? "";
    fullName = fullNameFromProfile(profile as Record<string, unknown> | null);
    if (!fullName) {
      // Zonder naam-claim valt de UI terug op het e-mailadres. Log welke
      // claims er wél waren, zodat de Azure-app zo nodig aangepast kan worden.
      console.warn(
        "[SAML callback] Geen naam-claim gevonden. Beschikbare claims:",
        Object.keys((profile as Record<string, unknown>) ?? {}).join(", ")
      );
    }

    if (!email || !email.includes("@")) {
      throw new Error(`Geen geldig e-mailadres in SAML assertion. nameID: ${nameId}`);
    }
  } catch (err) {
    console.error("[SAML callback] Validatie mislukt:", err);
    return NextResponse.redirect(new URL("/login?error=saml_validation_failed", request.url), { status: 302 });
  }

  const token = createSessionToken(email, fullName || undefined);
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

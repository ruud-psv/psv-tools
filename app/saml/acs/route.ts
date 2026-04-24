import { NextRequest, NextResponse } from "next/server";
import { SAML } from "@node-saml/node-saml";
import { getSamlOptions } from "@/lib/saml-config";
import { createSessionToken } from "@/lib/auth";

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

  // URLSearchParams converts + to space (URL form encoding spec).
  // Base64 uses + as a valid character, so we restore them.
  const samlResponse = rawSamlResponse.replace(/ /g, "+");
  console.log("[SAML callback] Spaties hersteld naar +:", rawSamlResponse !== samlResponse);

  try {
    const decoded = Buffer.from(samlResponse, "base64").toString("utf8");
    console.log("[SAML callback] XML lengte:", decoded.length);
    console.log("[SAML callback] XML begin:", decoded.slice(0, 200));
  } catch (e) {
    console.error("[SAML callback] Kon SAMLResponse niet base64-decoderen:", e);
  }

  const saml = new SAML(getSamlOptions());

  let email: string;
  try {
    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
    });

    const nameId = profile?.nameID;
    const profileEmail = (profile as Record<string, unknown>)?.email as string | undefined;
    email = profileEmail ?? nameId ?? "";

    if (!email || !email.includes("@")) {
      throw new Error(`Geen geldig e-mailadres in SAML assertion. nameID: ${nameId}`);
    }
  } catch (err) {
    console.error("[SAML callback] Validatie mislukt:", err);
    return NextResponse.redirect(new URL("/login?error=saml_validation_failed", request.url));
  }

  const token = createSessionToken(email);
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set("psv_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 28800,
    path: "/",
  });
  return response;
}

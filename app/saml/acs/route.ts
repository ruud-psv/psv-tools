import { NextRequest, NextResponse } from "next/server";
import { SAML } from "@node-saml/node-saml";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
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

  const samlResponse = rawSamlResponse.replace(/ /g, "+");

  try {
    const decoded = Buffer.from(samlResponse, "base64").toString("utf8");
    console.log("[SAML callback] XML lengte:", decoded.length);

    // Find signature algorithm
    const sigMethodMatch = decoded.match(/<(?:[^:]+:)?SignatureMethod Algorithm="([^"]+)"/);
    console.log("[SAML callback] Signature algorithm:", sigMethodMatch?.[1] ?? "niet gevonden");

    // Count and find position of Signature elements
    const sigMatches = decoded.match(/<(?:[^:]+:)?Signature[\s>]/g) ?? [];
    console.log("[SAML callback] Aantal Signature elementen:", sigMatches.length);

    // Direct xml-crypto validation for detailed errors
    const dom = new DOMParser().parseFromString(decoded, "text/xml");
    const signatureNodes = dom.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    console.log("[SAML callback] Signature nodes gevonden:", signatureNodes.length);

    if (signatureNodes.length > 0) {
      const opts = getSamlOptions();
      const certPem = typeof opts.cert === "string" ? opts.cert : "";
      const sig = new SignedXml({ idAttributes: ["ID", "Id", "id"] });
      sig.loadSignature(signatureNodes[0]);
      const valid = sig.checkSignature(decoded, { publicCert: certPem });
      console.log("[SAML callback] Direct xml-crypto geldig:", valid);
      console.log("[SAML callback] Direct xml-crypto fouten:", sig.validationErrors);
    }
  } catch (e) {
    console.error("[SAML callback] Diagnostiek fout:", e);
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

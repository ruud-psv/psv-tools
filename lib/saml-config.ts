import type { SamlConfig } from "@node-saml/node-saml";
import { ValidateInResponseTo } from "@node-saml/node-saml";

let certCache: { cert: string; fetchedAt: number } | null = null;

async function fetchCertFromAzureMetadata(entryPoint: string): Promise<string | null> {
  const tenantMatch = entryPoint.match(/login\.microsoftonline\.com\/([^/]+)\//);
  if (!tenantMatch) return null;

  const now = Date.now();
  if (certCache && now - certCache.fetchedAt < 3600 * 1000) {
    return certCache.cert;
  }

  const metadataUrl = `https://login.microsoftonline.com/${tenantMatch[1]}/federationmetadata/2007-06/federationmetadata.xml`;

  try {
    const res = await fetch(metadataUrl);
    if (!res.ok) return null;
    const xml = await res.text();

    // Prefer a KeyDescriptor with use="signing"
    const signingBlock = xml.match(/<KeyDescriptor use="signing"[\s\S]*?<\/KeyDescriptor>/);
    const searchXml = signingBlock ? signingBlock[0] : xml;

    const match = searchXml.match(
      /<(?:[^:>\s]+:)?X509Certificate[^>]*>([^<]+)<\/(?:[^:>\s]+:)?X509Certificate>/
    );
    if (!match) return null;

    const rawBase64 = match[1].replace(/\s/g, "");
    const pemLines = rawBase64.match(/.{1,64}/g) ?? [];
    const cert = `-----BEGIN CERTIFICATE-----\n${pemLines.join("\n")}\n-----END CERTIFICATE-----`;

    certCache = { cert, fetchedAt: now };
    return cert;
  } catch {
    return null;
  }
}

export async function getSamlOptions(): Promise<SamlConfig> {
  const entryPoint = process.env.SAML_ENTRY_POINT;
  const issuer = process.env.SAML_ISSUER;
  const idpCert = process.env.SAML_CERT;
  const callbackUrl = process.env.SAML_CALLBACK_URL;

  if (!entryPoint || !issuer || !callbackUrl) {
    throw new Error(
      "SAML configuratie ontbreekt: controleer SAML_ENTRY_POINT, SAML_ISSUER en SAML_CALLBACK_URL."
    );
  }

  // Auto-fetch cert from Azure's public metadata endpoint (derived from SAML_ENTRY_POINT)
  let cert = await fetchCertFromAzureMetadata(entryPoint);

  // Fall back to SAML_CERT env var if metadata fetch fails or isn't an Azure URL
  if (!cert) {
    if (!idpCert) {
      throw new Error(
        "SAML configuratie ontbreekt: stel SAML_CERT in of gebruik een Azure entry point voor automatische certificaat-ophaling."
      );
    }
    const rawBase64 = idpCert
      .replace(/\s/g, "")
      .replace(/-----BEGINCERTIFICATE-----/g, "")
      .replace(/-----ENDCERTIFICATE-----/g, "");
    const pemLines = rawBase64.match(/.{1,64}/g) ?? [];
    cert = `-----BEGIN CERTIFICATE-----\n${pemLines.join("\n")}\n-----END CERTIFICATE-----`;
  }

  return {
    entryPoint,
    issuer,
    cert,
    callbackUrl,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    disableRequestedAuthnContext: true,
    acceptedClockSkewMs: 5000,
    validateInResponseTo: ValidateInResponseTo.never,
    wantAuthnResponseSigned: false,
  };
}

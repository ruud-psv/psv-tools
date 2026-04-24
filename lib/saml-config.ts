import type { SamlConfig } from "@node-saml/node-saml";
import { ValidateInResponseTo } from "@node-saml/node-saml";

function certFromEnv(idpCert: string): string {
  // Keep only valid base64 characters — strips PEM headers, newlines, spaces, stray chars
  const rawBase64 = idpCert.replace(/[^A-Za-z0-9+/=]/g, "");
  if (!rawBase64) throw new Error("SAML_CERT bevat geen geldige base64-inhoud.");
  const pemLines = rawBase64.match(/.{1,64}/g) ?? [];
  const pem = `-----BEGIN CERTIFICATE-----\n${pemLines.join("\n")}\n-----END CERTIFICATE-----`;
  // Validate before returning so we fail early with a clear message
  try {
    new (require("crypto").X509Certificate)(pem);
  } catch (e) {
    throw new Error(`SAML_CERT is geen geldig X.509-certificaat: ${(e as Error).message}`);
  }
  return pem;
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

  // SAML_CERT (app-specific cert from Azure Portal) takes priority
  if (idpCert) {
    return {
      entryPoint,
      issuer,
      cert: certFromEnv(idpCert),
      callbackUrl,
      identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      disableRequestedAuthnContext: true,
      acceptedClockSkewMs: 5000,
      validateInResponseTo: ValidateInResponseTo.never,
      wantAuthnResponseSigned: false,
    };
  }

  // Fallback: fetch cert from Azure's tenant-wide federation metadata
  const tenantMatch = entryPoint.match(/login\.microsoftonline\.com\/([^/]+)\//);
  if (!tenantMatch) {
    throw new Error("SAML configuratie ontbreekt: stel SAML_CERT in.");
  }

  const metadataUrl = `https://login.microsoftonline.com/${tenantMatch[1]}/federationmetadata/2007-06/federationmetadata.xml`;
  const res = await fetch(metadataUrl);
  if (!res.ok) throw new Error(`Kon Azure metadata niet ophalen: ${res.status}`);
  const xml = await res.text();

  const signingBlock = xml.match(/<KeyDescriptor use="signing"[\s\S]*?<\/KeyDescriptor>/);
  const searchXml = signingBlock ? signingBlock[0] : xml;
  const match = searchXml.match(
    /<(?:[^:>\s]+:)?X509Certificate[^>]*>([^<]+)<\/(?:[^:>\s]+:)?X509Certificate>/
  );
  if (!match) throw new Error("Geen X509Certificate gevonden in Azure metadata.");

  const rawBase64 = match[1].replace(/\s/g, "");
  const pemLines = rawBase64.match(/.{1,64}/g) ?? [];
  const cert = `-----BEGIN CERTIFICATE-----\n${pemLines.join("\n")}\n-----END CERTIFICATE-----`;

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

import type { SamlConfig } from "@node-saml/node-saml";
import { ValidateInResponseTo } from "@node-saml/node-saml";

export function getSamlOptions(): SamlConfig {
  const entryPoint = process.env.SAML_ENTRY_POINT;
  const issuer = process.env.SAML_ISSUER;
  const idpCert = process.env.SAML_CERT;
  const callbackUrl = process.env.SAML_CALLBACK_URL;

  if (!entryPoint || !issuer || !idpCert || !callbackUrl) {
    throw new Error(
      "SAML configuratie ontbreekt: controleer SAML_ENTRY_POINT, SAML_ISSUER, SAML_CERT en SAML_CALLBACK_URL."
    );
  }

  // Strip whitespace and PEM headers to get raw base64
  const rawBase64 = idpCert
    .replace(/\s/g, "")
    .replace(/-----BEGINCERTIFICATE-----/g, "")
    .replace(/-----ENDCERTIFICATE-----/g, "");

  // Rebuild as proper PEM (64-char lines) so node-saml / xml-crypto gets the exact expected format
  const pemLines = rawBase64.match(/.{1,64}/g) ?? [];
  const normalizedCert = `-----BEGIN CERTIFICATE-----\n${pemLines.join("\n")}\n-----END CERTIFICATE-----`;

  console.log("[SAML config] Cert lengte (base64):", rawBase64.length);
  console.log("[SAML config] Cert begin:", rawBase64.slice(0, 20));
  console.log("[SAML config] Cert einde:", rawBase64.slice(-20));

  return {
    entryPoint,
    issuer,
    cert: normalizedCert,
    callbackUrl,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    disableRequestedAuthnContext: true,
    acceptedClockSkewMs: 5000,
    validateInResponseTo: ValidateInResponseTo.never,
  };
}

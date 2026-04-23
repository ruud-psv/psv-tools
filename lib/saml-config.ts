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

  return {
    entryPoint,
    issuer,
    idpCert,
    callbackUrl,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    disableRequestedAuthnContext: true,
    acceptedClockSkewMs: 5000,
    validateInResponseTo: ValidateInResponseTo.never,
  };
}

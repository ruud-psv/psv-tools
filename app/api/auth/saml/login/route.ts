import { NextResponse } from "next/server";
import { SAML } from "@node-saml/node-saml";
import { getSamlOptions } from "@/lib/saml-config";

export async function GET() {
  const saml = new SAML(await getSamlOptions());
  const url = await saml.getAuthorizeUrlAsync("", "", {});
  return NextResponse.redirect(url);
}

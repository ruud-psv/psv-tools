import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.MAILEON_BASE_URL;
const API_KEY = process.env.MAILEON_API_KEY;
const FOLDER_ID = process.env.MAILEON_FOLDER_ID ?? "n9267_2";

const MAILEON_CDN_PREFIX =
  "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]";
const PREVIEW_CDN_PREFIX = "https://images.maileon-static.com";

function missingEnvResponse() {
  return NextResponse.json(
    {
      error:
        "Maileon configuratie ontbreekt. Controleer MAILEON_BASE_URL en MAILEON_API_KEY in .env.local.",
    },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  if (!BASE || !API_KEY) return missingEnvResponse();

  const authHeader = `Basic ${Buffer.from(`${API_KEY}:`).toString("base64")}`;

  let file: File;
  try {
    const body = await req.formData();
    const f = body.get("file");
    if (!f || typeof f === "string") {
      return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
    }
    file = f as File;
  } catch {
    return NextResponse.json({ error: "Kon form data niet verwerken." }, { status: 400 });
  }

  // Step 1: upload to Maileon media library
  const uploadForm = new FormData();
  uploadForm.append("elements[0].name", file.name);
  uploadForm.append("elements[0].mimetype", file.type);
  uploadForm.append("elements[0].file", file);
  uploadForm.append("folderId", FOLDER_ID);
  uploadForm.append("update", "2");
  uploadForm.append("global", "false");

  let fileId: string;
  try {
    const uploadRes = await fetch(
      `${BASE}/cms_multi_file_upload.msa?struts.enableJSONValidation=true`,
      { method: "POST", headers: { Authorization: authHeader }, body: uploadForm }
    );

    if (uploadRes.status === 403) {
      return NextResponse.json(
        { error: "API-key ongeldig of onvoldoende rechten. Controleer MAILEON_API_KEY in .env.local." },
        { status: 403 }
      );
    }
    if (!uploadRes.ok) {
      return NextResponse.json(
        { error: `Upload mislukt (HTTP ${uploadRes.status}).` },
        { status: 502 }
      );
    }

    const data = await uploadRes.json();
    if (!data.complete || !data.uploadedFileIds?.length) {
      return NextResponse.json(
        { error: "Maileon gaf geen bevestiging van de upload.", detail: data },
        { status: 502 }
      );
    }
    fileId = data.uploadedFileIds[0] as string;
  } catch (err) {
    return NextResponse.json(
      { error: "Verbindingsfout bij uploaden.", detail: String(err) },
      { status: 502 }
    );
  }

  // Step 2: fetch the Maileon template URL for this file
  let maileonUrl: string;
  try {
    const urlForm = new FormData();
    urlForm.append("fileId", fileId);

    const urlRes = await fetch(
      `${BASE}/get_cms_file_url.msa`,
      { method: "POST", headers: { Authorization: authHeader }, body: urlForm }
    );

    if (!urlRes.ok) {
      return NextResponse.json(
        { error: `URL ophalen mislukt (HTTP ${urlRes.status}).` },
        { status: 502 }
      );
    }

    const urlData = await urlRes.json();
    if (!urlData.fileUrl) {
      return NextResponse.json(
        { error: "Geen URL ontvangen van Maileon.", detail: urlData },
        { status: 502 }
      );
    }
    maileonUrl = urlData.fileUrl as string;
  } catch (err) {
    return NextResponse.json(
      { error: "Verbindingsfout bij ophalen URL.", detail: String(err) },
      { status: 502 }
    );
  }

  // Maileon returns the URL in two possible forms depending on account config:
  // - urlWithMergetags:true  → "[[MAILING|PROTOCOL|http]]://[[ACCOUNT|MAILING-DOMAIN]]/c/{hash}/media/{file}"
  // - urlWithMergetags:false → "https://newsletter.psv.nl/c/{hash}/media/{file}" (resolved domain)
  // In both cases we extract the /c/{hash}/media/{file} path and rebuild both variants.
  let previewUrl: string;
  let exportUrl: string;

  try {
    const path = maileonUrl.startsWith("[[")
      ? maileonUrl.replace(MAILEON_CDN_PREFIX, "")
      : new URL(maileonUrl).pathname;
    previewUrl = `${PREVIEW_CDN_PREFIX}${path}`;
    exportUrl = `${MAILEON_CDN_PREFIX}${path}`;
  } catch {
    previewUrl = maileonUrl;
    exportUrl = maileonUrl;
  }

  return NextResponse.json({ maileonUrl: exportUrl, previewUrl, fileId });
}

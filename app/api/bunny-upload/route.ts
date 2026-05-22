import { NextRequest, NextResponse } from "next/server";

const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const API_KEY = process.env.BUNNY_STORAGE_API_KEY;
const CDN_URL = process.env.BUNNY_CDN_URL?.replace(/\/$/, "");
const STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com";
const FOLDER = "mail-builder";

export async function POST(req: NextRequest) {
  if (!STORAGE_ZONE || !API_KEY || !CDN_URL) {
    return NextResponse.json(
      { error: "Bunny CDN configuratie ontbreekt. Controleer BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY en BUNNY_CDN_URL in .env.local." },
      { status: 500 }
    );
  }

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

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
  const storagePath = `${FOLDER}/${uniqueName}`;
  const uploadUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${storagePath}`;

  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        AccessKey: API_KEY,
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Upload mislukt (HTTP ${res.status}).`, detail: text },
        { status: 502 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Verbindingsfout bij uploaden naar Bunny.", detail: String(err) },
      { status: 502 }
    );
  }

  const cdnUrl = `${CDN_URL}/${storagePath}`;
  return NextResponse.json({ url: cdnUrl });
}

const REQUIRED = {
  mail_nl: ["doelgroep", "exploitatie", "doel_van_de_mail", "cta_omschrijving"],
  partner_copy: ["partner", "doel_van_de_mail", "cta_omschrijving"],
};

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Payload ontbreekt.";
  }
  if (!payload.category || typeof payload.category !== "string") {
    return "Categorie ontbreekt.";
  }

  const category = payload.category;
  if (REQUIRED[category]) {
    for (const field of REQUIRED[category]) {
      if (!payload[field] || String(payload[field]).trim().length === 0) {
        return `Veld ontbreekt: ${field}.`;
      }
    }
    return null;
  }

  if (!payload.details || String(payload.details).trim().length === 0) {
    return "Tekst ontbreekt.";
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: "N8N_WEBHOOK_URL ontbreekt in de server env." });
  }

  const validationError = validatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.N8N_WEBHOOK_SECRET) {
    headers["X-N8N-SECRET"] = process.env.N8N_WEBHOOK_SECRET;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });

    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "n8n response error",
        details: body,
      });
    }

    if (contentType.includes("application/json")) {
      return res.status(200).json(body);
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(body);
  } catch (error) {
    return res.status(500).json({
      error: "Kon n8n niet bereiken.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

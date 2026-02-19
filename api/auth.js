function parseBasicAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return null;

  const encoded = header.slice(6).trim();
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      user: decoded.slice(0, separatorIndex),
      pass: decoded.slice(separatorIndex + 1),
    };
  } catch (error) {
    return null;
  }
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expectedUser = process.env.PSV_AUTH_USER;
  const expectedPass = process.env.PSV_AUTH_PASS;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: "PSV_AUTH_USER of PSV_AUTH_PASS ontbreekt." });
  }

  const credentials = parseBasicAuth(req);
  if (!credentials) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).json({ error: "Geen autorisatie meegegeven." });
  }

  if (
    credentials.user !== expectedUser ||
    credentials.pass !== expectedPass
  ) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).json({ error: "Ongeldige inloggegevens." });
  }

  return res.status(200).json({ ok: true });
}

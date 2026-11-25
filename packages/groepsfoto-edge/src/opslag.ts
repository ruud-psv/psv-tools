/**
 * De privé storage zone op Bunny, via de gewone opslag-API (geen S3). Hier
 * staan de config en de basisfoto die PSV Tools publiceert, en de tellers.
 */

export interface Opslag {
  leesTekst(pad: string): Promise<string | null>;
  leesBytes(pad: string): Promise<Uint8Array | null>;
  schrijf(pad: string, inhoud: string, contentType: string): Promise<void>;
}

export function bunnyOpslag(opties: {
  zone: string;
  sleutel: string;
  host?: string;
  fetch?: typeof fetch;
}): Opslag {
  const f = opties.fetch ?? fetch;
  const basis = `https://${opties.host || "storage.bunnycdn.com"}/${opties.zone}/`;

  async function haal(pad: string): Promise<Response | null> {
    const res = await f(basis + pad, { headers: { AccessKey: opties.sleutel } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Opslag lezen mislukt (HTTP ${res.status}) voor ${pad}`);
    return res;
  }

  return {
    async leesTekst(pad) {
      const res = await haal(pad);
      return res ? res.text() : null;
    },
    async leesBytes(pad) {
      const res = await haal(pad);
      return res ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    async schrijf(pad, inhoud, contentType) {
      const res = await f(basis + pad, {
        method: "PUT",
        headers: { AccessKey: opties.sleutel, "Content-Type": contentType },
        body: inhoud,
      });
      if (!res.ok) throw new Error(`Opslag schrijven mislukt (HTTP ${res.status}) voor ${pad}`);
    },
  };
}

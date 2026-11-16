/** Waar het inlezen van de wachtlijst staat, voor de pagina en de inleesroute. */

import { ownersToLookUp, waitlistOwners, type WaitlistColumns, type WaitlistData, type WaitlistProduct } from "./data";
import { isWaitlistLocked, type WaitlistState } from "./store";

export type WaitlistPhase = "leeg" | "producten" | "geen-product" | "verkoop" | "klanten" | "klaar";

export interface WaitlistStatus {
  phase: WaitlistPhase;
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  products: ({ productId: string } & WaitlistProduct)[];
  /** Producten van het type Memberships, om uit te kiezen als de naam niet past. */
  candidates: ({ productId: string } & WaitlistProduct)[];
  chosenByHand: boolean;
  salesRead: number;
  salesComplete: boolean;
  salesCaughtUpAt: string | null;
  clientsRead: number;
  clientsPass: "idle" | "running";
  clientsPassDoneAt: string | null;
  /** Mensen op de wachtlijst met klantgegevens / nog op te zoeken / niet gevonden. */
  clientsKnown: number;
  clientsToLookUp: number;
  clientsUnmatched: number;
  columns: WaitlistColumns;
}

function list(products: Record<string, WaitlistProduct>) {
  return Object.entries(products)
    .map(([productId, product]) => ({ productId, ...product }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function waitlistStatus(data: WaitlistData | null, state: WaitlistState): WaitlistStatus {
  const base = {
    running: isWaitlistLocked(state),
    lastRunAt: state.lastRunAt,
    lastError: state.lastError,
  };
  if (!data) {
    return {
      ...base,
      phase: "leeg",
      products: [],
      candidates: [],
      chosenByHand: false,
      salesRead: 0,
      salesComplete: false,
      salesCaughtUpAt: null,
      clientsRead: 0,
      clientsPass: "idle",
      clientsPassDoneAt: null,
      clientsKnown: 0,
      clientsToLookUp: 0,
      clientsUnmatched: 0,
      columns: { salesOwner: null, clientKey: null, birth: null, postcode: null, country: null },
    };
  }

  const products = list(data.products);
  const active = waitlistOwners(data, true);
  let phase: WaitlistPhase = "klaar";
  if (!products.length) phase = data.productsCursor ? "geen-product" : "producten";
  else if (!data.salesComplete) phase = "verkoop";
  else if (data.clientsPass === "running" || (!data.clientsPassDoneAt && active.size > 0)) phase = "klanten";

  return {
    ...base,
    phase,
    products,
    candidates: list(data.candidates),
    chosenByHand: data.chosen !== null,
    salesRead: data.salesRead,
    salesComplete: data.salesComplete,
    salesCaughtUpAt: data.salesCaughtUpAt,
    clientsRead: data.clientsRead,
    clientsPass: data.clientsPass,
    clientsPassDoneAt: data.clientsPassDoneAt,
    clientsKnown: [...active].filter((owner) => data.clients[owner]).length,
    clientsToLookUp: ownersToLookUp(data).length,
    clientsUnmatched: data.unmatched.filter((owner) => active.has(owner)).length,
    columns: data.columns,
  };
}

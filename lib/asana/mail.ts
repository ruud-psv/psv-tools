import { generateEmailHTML, makeInitialState, newBlock, type MailBuilderState } from "@/lib/mail-builder/html";
import { mailProblemen } from "@/lib/mail-builder/validate";

import type { MailOpzet } from "./brief";

/**
 * Van de opzet uit een content brief naar de mail zelf, met de generator van
 * de Mail Builder. Gedeeld door de pagina (in de browser) en de automaat (op
 * de server), zodat ze precies dezelfde mail maken.
 */
export function mailUitOpzet(opzet: MailOpzet): {
  state: MailBuilderState;
  /** De HTML voor Maileon, met Maileon-tokens. */
  html: string;
  /** De HTML zoals de Mail Builder hem toont. */
  voorbeeld: string;
  /** Wat de Mail Builder zelf zou weigeren bij Download. */
  problemen: string[];
} {
  const state: MailBuilderState = {
    ...makeInitialState(opzet.template),
    ...opzet,
    blocks: opzet.blocks.map((b) => newBlock(b)),
  };
  return {
    state,
    html: generateEmailHTML(state, true),
    voorbeeld: generateEmailHTML(state, false),
    problemen: mailProblemen(state),
  };
}

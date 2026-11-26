/**
 * Herstel van een stand met "0 MijnPSV-fans". Dat is geen telling maar een
 * lege BlueConic-uitkomst (op 26 november 2026 gebeurd: een token zonder
 * rechten gaf een lege lijst). Zo'n stand telt alleen voor Maileon; het
 * MijnPSV-deel wordt weer "onbekend".
 */

import type { DagStand, Telling } from "./types";

function zonderMijnpsv(t: Telling): Telling {
  return t.mijnpsv === 0 ? { maileon: t.maileon, mijnpsv: null, overlap: null, totaal: null } : t;
}

export function zonderLegeMijnpsv(dag: DagStand): DagStand {
  if (dag.engaged.mijnpsv !== 0 && dag.active.mijnpsv !== 0) return dag;
  return { ...dag, engaged: { ...zonderMijnpsv(dag.engaged), maand: dag.engaged.maand }, active: zonderMijnpsv(dag.active) };
}

import type { Department } from "@/lib/types";

/** Il reparto che vale per un turno.
 *
 *  Quello scritto sul turno vince su quello della persona: serve a dire
 *  «oggi copre in sala» senza spostarla di reparto per sempre. È la stessa
 *  regola che usa la Supervisione in `segmentiDelGiorno`, e sta qui perché
 *  ora la leggono in tre: due elenchi che rispondessero diversamente
 *  farebbero dubitare di quale sia il turno vero. */
export function repartoDelTurno(
  reparti: Department[],
  turnoDepartmentId: string | null,
  personaDepartmentId: string | null | undefined,
): Department | null {
  const id = turnoDepartmentId ?? personaDepartmentId ?? null;
  if (!id) return null;
  return reparti.find((r) => r.id === id) ?? null;
}

import { toISODate, weekDays, weekStart, fromISODate } from "@/lib/date";

/** Helper su stringhe YYYY-MM-DD, usabili anche dalle Server Action senza
 *  passare da oggetti Date. */

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function weekDaysISO(mondayISO: string): string[] {
  return weekDays(fromISODate(mondayISO)).map(toISODate);
}

/** Il lunedi' della settimana chiesta, con ripiego su quella corrente se il
 *  parametro nell'indirizzo e' assente o scritto male. */
export function resolveMonday(param?: string | string[]): string {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = fromISODate(raw);
    if (!Number.isNaN(d.getTime())) return toISODate(weekStart(d));
  }
  return toISODate(weekStart(new Date()));
}

/** Il lunedi' della settimana che contiene questa data. */
export function mondayOf(iso: string): string {
  return toISODate(weekStart(fromISODate(iso)));
}

/** I giorni coinvolti da una copia: sette se si muove una settimana, uno solo
 *  se si muove un giorno. Serve identica sul server e nel browser, cosi' i
 *  numeri dell'anteprima sono quelli che verranno davvero scritti. */
export function giorniCoinvolti(
  modo: "settimana" | "giorno",
  iso: string,
): string[] {
  return modo === "settimana" ? weekDaysISO(mondayOf(iso)) : [iso];
}

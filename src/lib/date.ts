import {
  addDays,
  differenceInMinutes,
  format,
  parse,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";

/** Tutta l'app ragiona su date "civili" (YYYY-MM-DD), non su istanti.
 *  Un turno del 3 marzo resta del 3 marzo qualunque sia il fuso di chi guarda:
 *  se usassimo Date con orario, chi apre l'app da un fuso diverso vedrebbe il
 *  turno spostato di un giorno. */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function fromISODate(s: ISODate): Date {
  return parse(s, "yyyy-MM-dd", new Date());
}

/** La settimana lavorativa inizia di lunedi'. */
export function weekStart(d: Date = new Date()): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function shiftWeek(start: Date, delta: number): Date {
  return addDays(start, delta * 7);
}

export function isSameISODate(a: ISODate, b: ISODate) {
  return a === b;
}

export function isToday(d: Date) {
  return toISODate(d) === toISODate(new Date());
}

/** "3 – 9 marzo 2026", oppure con i due mesi se la settimana e' a cavallo. */
export function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${format(start, "d", { locale: it })} – ${format(end, "d MMMM yyyy", { locale: it })}`;
  }
  if (sameYear) {
    return `${format(start, "d MMM", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })}`;
  }
  return `${format(start, "d MMM yyyy", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })}`;
}

export function dayShort(d: Date) {
  return format(d, "EEE", { locale: it });
}

export function dayLong(d: Date) {
  return format(d, "EEEE d MMMM", { locale: it });
}

/** "08:00" da "08:00:00". I campi <input type="time"> vogliono HH:MM. */
export function hhmm(time: string) {
  return time.slice(0, 5);
}

export function timeRange(start: string, end: string) {
  return `${hhmm(start)} – ${hhmm(end)}`;
}

/** Durata in minuti. Se l'ora di fine e' minore di quella di inizio il turno
 *  scavalca la mezzanotte, quindi vale il giorno dopo. */
export function durationMinutes(start: string, end: string): number {
  const base = new Date(2000, 0, 1);
  const s = parse(hhmm(start), "HH:mm", base);
  let e = parse(hhmm(end), "HH:mm", base);
  if (e <= s) e = addDays(e, 1);
  return differenceInMinutes(e, s);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function crossesMidnight(start: string, end: string) {
  return hhmm(end) <= hhmm(start);
}

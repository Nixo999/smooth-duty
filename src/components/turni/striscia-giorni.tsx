"use client";

import { dayShort, fromISODate, isToday } from "@/lib/date";
import { cn } from "@/lib/utils";

/** I sette giorni della settimana in fila, da telefono: si sceglie quello da
 *  guardare, perché una griglia sette per trenta su uno schermo largo quanto
 *  una mano non si legge.
 *
 *  Sta in un file suo perché la usano due viste dello stesso tabellone — i
 *  turni e le disponibilità — e due strisce che si comportano diversamente
 *  farebbero perdere il giorno scelto cambiando vista, che è l'unica cosa che
 *  chi la usa non si aspetta. */
export function StrisciaGiorni({
  days,
  indice,
  onSceglie,
  segnati,
}: {
  days: string[];
  indice: number;
  onSceglie: (i: number) => void;
  /** Il pallino sotto il numero: quel giorno c'è qualcosa scritto. Cosa sia
   *  lo decide chi la usa — turni da una parte, dichiarazioni dall'altra. */
  segnati: (day: string) => boolean;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {days.map((day, i) => {
        const d = fromISODate(day);
        const active = i === indice;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSceglie(i)}
            aria-pressed={active}
            className={cn(
              "tap flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-xl border px-2 py-2",
              active
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-muted",
              !active && isToday(d) && "border-accent",
            )}
          >
            <span className="text-[12px] font-medium capitalize">{dayShort(d)}</span>
            <span className="text-[16px] font-semibold cifre">
              {d.getDate()}
            </span>
            <span
              className={cn(
                "h-1 w-1 rounded-full",
                segnati(day)
                  ? active
                    ? "bg-accent-fg"
                    : "bg-accent"
                  : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

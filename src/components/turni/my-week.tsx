import { Clock, Info, MapPin } from "lucide-react";
import { ConfermaRientro } from "@/components/turni/conferma-rientro";
import { WeekNav } from "@/components/turni/week-nav";
import {
  assenzaAperta,
  assenzaDelGiorno,
  descriviAssenza,
  ETICHETTA,
} from "@/lib/assenze";
import {
  crossesMidnight,
  dayLong,
  durationMinutes,
  formatDuration,
  fromISODate,
  isToday,
  timeRange,
} from "@/lib/date";
import { repartoDelTurno } from "@/lib/reparto";
import type { Absence, Department, Shift } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Vista del dipendente: la settimana per giorni, senza griglia. Deve
 *  rispondere a una domanda sola — quando lavoro — anche da telefono. */
export function MyWeek({
  monday,
  days,
  shifts,
  assenze,
  profileId,
  reparti,
  repartoPersona,
}: {
  monday: string;
  days: string[];
  shifts: Shift[];
  assenze: Absence[];
  profileId: string;
  reparti: Department[];
  /** Il reparto di chi guarda: vale per i turni che non ne portano uno loro. */
  repartoPersona: string | null;
}) {
  const assente = (s: Shift) =>
    Boolean(assenzaDelGiorno(assenze, s.profile_id, s.date));

  /** Dove si lavora, al posto della mansione: è la prima cosa che serve
   *  sapere per presentarsi al posto giusto. */
  const reparto = (s: Shift) =>
    repartoDelTurno(reparti, s.department_id, repartoPersona);

  // Le ore di quando si è assenti non si sommano: il totale deve dire quanto
  // si lavorerà davvero.
  const total = shifts.reduce(
    (sum, s) => (assente(s) ? sum : sum + durationMinutes(s.start_time, s.end_time)),
    0,
  );

  const inCorso = assenzaAperta(assenze, profileId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav monday={monday} />
        <div className="rounded-full bg-surface-3 px-3 py-1.5 text-[13px] font-medium tabular-nums text-muted">
          {formatDuration(total)} in settimana
        </div>
      </div>

      {inCorso ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3.5">
          <div className="flex items-start gap-2.5 text-warning">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[14px] font-medium first-letter:uppercase">
                {descriviAssenza(inCorso, (iso) => dayLong(fromISODate(iso)))}
              </p>
              <p className="text-[12.5px] opacity-80">
                I turni di questi giorni restano in elenco ma non contano.
                Quando torni, confermalo: da lì tornano validi.
              </p>
            </div>
          </div>
          <ConfermaRientro />
        </div>
      ) : null}

      <ul className="stagger space-y-2.5">
        {days.map((day) => {
          const d = fromISODate(day);
          const today = isToday(d);
          const assenzaOggi = assenzaDelGiorno(assenze, profileId, day);
          const list = shifts
            .filter((s) => s.date === day)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

          return (
            <li
              key={day}
              className={cn(
                "overflow-hidden rounded-2xl border bg-surface shadow-soft",
                today ? "border-accent" : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex flex-wrap items-baseline gap-x-2 px-4 py-2.5",
                  today ? "bg-accent-soft" : "bg-surface-2",
                )}
              >
                <p
                  className={cn(
                    "text-[13.5px] font-medium capitalize",
                    today && "text-accent",
                  )}
                >
                  {dayLong(d)}
                </p>
                {today ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                    oggi
                  </span>
                ) : null}
                {assenzaOggi ? (
                  <span className="ml-auto rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                    {ETICHETTA(assenzaOggi.type)}
                  </span>
                ) : null}
              </div>

              {list.length === 0 ? (
                <p className="px-4 py-4 text-[13.5px] text-faint">Riposo</p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((s) => {
                    const suo = reparto(s);
                    return (
                      <li
                        key={s.id}
                        className={cn("px-4 py-3.5", assente(s) && "assente")}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="orario text-[17px] font-semibold tabular-nums tracking-tight">
                            {timeRange(s.start_time, s.end_time)}
                          </span>
                          {assente(s) ? (
                            <span className="text-[12.5px] font-medium text-warning">
                              non conta
                            </span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
                                <Clock className="size-3" />
                                {formatDuration(durationMinutes(s.start_time, s.end_time))}
                              </span>
                              {crossesMidnight(s.start_time, s.end_time) ? (
                                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] font-medium text-warning">
                                  finisce il giorno dopo
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>

                        {suo ? (
                          <p className="mt-1.5">
                            <span
                              className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide"
                              style={{ ["--tinta" as string]: suo.hue }}
                            >
                              {suo.name}
                            </span>
                          </p>
                        ) : null}

                        {s.location ? (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-muted">
                            <MapPin className="size-3" />
                            {s.location}
                          </p>
                        ) : null}

                        {s.notes ? (
                          <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
                            {s.notes}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

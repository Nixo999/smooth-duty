import { Clock, Info, MapPin } from "lucide-react";
import { ConfermaRientro } from "@/components/turni/conferma-rientro";
import { Posta } from "@/components/turni/posta";
import { WeekNav } from "@/components/turni/week-nav";
import { statoConferma } from "@/lib/conferme";
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
  oggiCivile,
  timeRange,
} from "@/lib/date";
import { repartoDelTurno } from "@/lib/reparto";
import type {
  Absence,
  Avviso,
  Department,
  RichiestaSettimana,
  Shift,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Perche' questo turno lo si puo' rifiutare, scritto come lo si direbbe.
 *  Il turno intanto vale: qui non si chiede un permesso, si segnala una
 *  cosa fuori dall'ordinario e si lascia la facolta' di dire di no. */
const MOTIVO_RIFIUTO = {
  straordinario: "Straordinario: va oltre le tue ore da contratto.",
  modifica: "Turno modificato dopo la pubblicazione della settimana.",
  modifica_straordinario:
    "Turno modificato, e ora va oltre le tue ore da contratto.",
  orario_diverso: "Orario diverso da quello del tuo contratto.",
  cambio_reparto: "Cambia il reparto: stesso orario, un altro posto.",
} as const;

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
  inBozza,
  avvisi,
  richiestaSettimana,
}: {
  monday: string;
  days: string[];
  shifts: Shift[];
  assenze: Absence[];
  profileId: string;
  reparti: Department[];
  /** Il reparto di chi guarda: vale per i turni che non ne portano uno loro. */
  repartoPersona: string | null;
  /** La settimana e' ancora in bozza: i turni non arrivano proprio. */
  inBozza: boolean;
  /** Gli avvisi non ancora letti. Non sono filtrati per settimana: un turno
   *  tolto di sabato non deve sparire perche' si sta guardando lunedi'. */
  avvisi: Avviso[];
  /** La domanda sulla settimana mostrata, se c'e' e se e' ancora aperta. */
  richiestaSettimana: RichiestaSettimana | null;
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

  /** I turni su cui non si e' ancora detto niente e che devono ancora
   *  arrivare: sono quelli che finiscono nella posta. Su un turno gia'
   *  lavorato non c'e' piu' niente da dire, e il database lo rifiuterebbe. */
  const oggi = oggiCivile();
  const daDecidere = shifts.filter(
    (s) => statoConferma(s) === "in_attesa" && s.date >= oggi,
  );

  return (
    <div className="space-y-4">
      <Posta
        turni={daDecidere}
        avvisi={avvisi}
        settimana={richiestaSettimana}
        monday={monday}
        motivoDelTurno={(t) =>
          t.richiede_conferma ? MOTIVO_RIFIUTO[t.richiede_conferma] : ""
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav monday={monday} />
        <div className="rounded-full bg-surface-3 px-3 py-1.5 text-[13px] font-medium tabular-nums text-muted">
          {formatDuration(total)} in settimana
        </div>
      </div>

      {inBozza ? (
        <div className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3.5 text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p className="text-[13.5px]">
            Il responsabile non ha ancora pubblicato questa settimana: i turni
            compariranno quando lo farà.
          </p>
        </div>
      ) : null}

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
          // Un giorno gia' passato: quello che c'era scritto e' stato fatto,
          // e non c'e' piu' niente da dirne. In ora italiana come il
          // database, dove sta la parola definitiva (`rifiuta_turno`,
          // `accetta_turno`): il server gira in UTC, e fino alle due di
          // notte i due si darebbero risposte diverse.
          const passato = day < oggiCivile();
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

                        <Risposta turno={s} passato={passato} />
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

/** Come sta messo un turno particolare, e cosa può ancora farci
 *  l'interessato.
 *
 *  Il turno vale già: non c'è niente da sbloccare. Si dice cos'ha di
 *  particolare e si lasciano due strade — un sì, che toglie il responsabile
 *  dal dubbio, e un no, che gli manda un messaggio — ma solo finché quel
 *  giorno deve ancora arrivare: su un turno già lavorato non c'è più niente
 *  da dire. */
function Risposta({ turno, passato }: { turno: Shift; passato: boolean }) {
  const stato = statoConferma(turno);
  if (!stato) return null;

  if (stato === "rifiutato") {
    return (
      <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
        Hai rifiutato questo turno: il responsabile è stato avvisato e ci
        penserà lui.
      </p>
    );
  }

  if (stato === "accettato") {
    return (
      <p className="mt-2 rounded-xl bg-success-soft px-3 py-2.5 text-[13px] font-medium text-success">
        Hai accettato questo turno.
      </p>
    );
  }

  if (passato || !turno.richiede_conferma) return null;

  // Il giorno dice **che cosa** ha di particolare; a rispondere si va nella
  // posta, in cima alla pagina. I due bottoni stavano qui dentro, e sembrava
  // logico: ma una cosa da decidere che sta dentro un giorno si vede solo se
  // si guarda quel giorno, e chi apre l'app il lunedì non scorre fino a
  // sabato.
  return (
    <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning">
      {MOTIVO_RIFIUTO[turno.richiede_conferma]}{" "}
      <span className="font-normal">
        Il turno è già valido. Per rispondere, il riquadro in cima alla pagina.
      </span>
    </p>
  );
}

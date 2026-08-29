import { CalendarClock, Clock, Info, MapPin } from "lucide-react";
import { ConfermaRientro } from "@/components/turni/conferma-rientro";
import { Posta } from "@/components/turni/posta";
import { WeekNav } from "@/components/turni/week-nav";
import { MOTIVO_RIFIUTO, statoConferma } from "@/lib/conferme";
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
import { siLavoreraDavvero } from "@/lib/ore-effettive";
import { repartoDelTurno } from "@/lib/reparto";
import type {
  Absence,
  Avviso,
  Department,
  RichiestaSettimana,
  Shift,
} from "@/lib/types";
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

  /** Le ore di questo turno non si faranno: o si è assenti quel giorno, o si
   *  è detto di no.
   *
   *  Un turno rifiutato resta a tabellone finché il responsabile non apre la
   *  casella — possono passare giorni — e in quella finestra sommarlo vuol
   *  dire scrivere «Hai rifiutato questo turno» e contarlo lo stesso, sulla
   *  stessa schermata.
   *
   *  ⚠️ «Non conta nel totale» e «da sbiadire» sono due cose diverse, e
   *  vanno tenute separate: `.assente` porta un `opacity: .45` che si eredita
   *  su tutta la riga, e dentro la riga di un turno rifiutato c'è il riquadro
   *  che spiega alla persona che cosa è successo al suo turno. Sbiadito
   *  scendeva a 2,08 di contrasto (chiaro) e 2,05 (scuro): l'unica frase che
   *  dà la spiegazione, resa illeggibile. Spento resta solo il turno di chi
   *  quel giorno non c'è, che infatti non ha niente da leggere. */
  const nonConta = (s: Shift) => !siLavoreraDavvero(s, assenze);

  /** Dove si lavora, al posto della mansione: è la prima cosa che serve
   *  sapere per presentarsi al posto giusto. */
  const reparto = (s: Shift) =>
    repartoDelTurno(reparti, s.department_id, repartoPersona);

  // Il totale deve dire quanto si lavorerà davvero.
  const total = shifts.reduce(
    (sum, s) => (nonConta(s) ? sum : sum + durationMinutes(s.start_time, s.end_time)),
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
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav monday={monday} />
        {/* In bozza i turni non arrivano: un totale sarebbe «0h in
            settimana», che si legge come «questa settimana non lavori». Non
            si sa ancora, e non saperlo si dice tacendo il numero. */}
        {inBozza ? null : (
          <div className="rounded-full bg-surface-3 px-3 py-1.5 text-[13px] font-medium cifre text-muted">
            {formatDuration(total)} in settimana
          </div>
        )}
      </div>

      {inCorso ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3.5">
          <div className="flex items-start gap-2.5 text-warning">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[14px] font-medium first-letter:uppercase">
                {descriviAssenza(inCorso, (iso) => dayLong(fromISODate(iso)))}
              </p>
              {/* Senza opacity: la riga sopra e' gia' in grassetto, e questa
                  e' l'unica frase che spiega l'assenza in corso. Sbiadita
                  scendeva a 3,27 di contrasto sul tema chiaro. */}
              <p className="text-[12.5px]">
                I turni di questi giorni restano in elenco ma non contano.
                Quando torni, confermalo: da lì tornano validi.
              </p>
            </div>
          </div>
          <ConfermaRientro />
        </div>
      ) : null}

      {/* In bozza i giorni non si disegnano affatto. Sette schede vuote
          direbbero «Riposo» sette volte, cioe' la cosa piu' sbagliata che si
          possa dire a chi sta chiedendo quando lavora: non e' riposo, e'
          che non si sa ancora. */}
      {inBozza ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface-2 px-6 py-10 text-center">
          <CalendarClock className="size-6 text-faint" />
          <p className="text-[15px] font-medium">
            La settimana non è ancora pubblicata
          </p>
          <p className="max-w-xs text-[13.5px] text-muted">
            Il responsabile non l&apos;ha ancora pubblicata. Quando lo fa, i
            tuoi turni compaiono qui: non devi fare niente.
          </p>
        </div>
      ) : (
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
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-accent">
                      oggi
                    </span>
                  ) : null}
                  {assenzaOggi ? (
                    <span className="ml-auto rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning">
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
                            <span className="orario text-[17px] font-semibold cifre tracking-tight">
                              {timeRange(s.start_time, s.end_time)}
                            </span>
                            {/* Un turno che non si fara' non porta la sua
                                durata: la riga e' l'unico posto in cui il
                                totale in cima si puo' ricontare a mano. */}
                            {nonConta(s) ? (
                              <span className="text-[12.5px] font-medium text-warning">
                                non conta
                              </span>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1 text-[12.5px] text-muted cifre">
                                  <Clock className="size-3" />
                                  {formatDuration(durationMinutes(s.start_time, s.end_time))}
                                </span>
                                {crossesMidnight(s.start_time, s.end_time) ? (
                                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning">
                                    finisce il giorno dopo
                                  </span>
                                ) : null}
                              </>
                            )}
                          </div>

                          {suo ? (
                            <p className="mt-1.5">
                              <span
                                className="pastiglia-reparto rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide"
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
      )}
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
  // La chiamata è l'unico caso in cui il turno **non** vale già. Dirle la
  // stessa frase degli altri sarebbe la bugia più comoda che questa app
  // possa raccontare: chi non risponde crederebbe di essere a posto, e il
  // lunedì mattina in negozio non ci sarebbe nessuno.
  const daAccettare = turno.richiede_conferma === "chiamata";

  return (
    <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning">
      {MOTIVO_RIFIUTO[turno.richiede_conferma]}{" "}
      <span className="font-normal">
        {daAccettare
          ? "Vale solo se rispondi di sì: senza la tua risposta questo turno non è tuo. Il riquadro in cima alla pagina."
          : "Il turno è già valido. Per rispondere, il riquadro in cima alla pagina."}
      </span>
    </p>
  );
}

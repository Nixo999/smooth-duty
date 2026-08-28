"use client";

import { CalendarClock, Check, Clock, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  segnaDisponibilita,
  togliDisponibilita,
} from "@/app/(app)/disponibilita/actions";
import { StrisciaGiorni } from "@/components/turni/striscia-giorni";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dayLong, dayShort, fromISODate, isToday, oggiCivile } from "@/lib/date";
import {
  descriviStato,
  statoDelGiorno,
  versoDelRegime,
  type Dichiarazione,
  type RegimeChiamata,
  type StatoGiorno,
} from "@/lib/disponibilita";
import type { Disponibilita } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Le disponibilità di chi è a chiamata, **dentro il tabellone**.
 *
 *  È la stessa settimana dei turni, con le stesse sette colonne e la stessa
 *  navigazione: si cambia solo cosa si scrive nelle caselle. Il responsabile
 *  che riceve una telefonata — «sabato non posso» — non deve andare da
 *  nessun'altra parte, e soprattutto non deve tenere a mente il tabellone
 *  mentre guarda un calendario che sta altrove.
 *
 *  Il gesto è quello che serve davvero qui: **si toccano le caselle, poi si
 *  dice cosa farne**. Non una casella per volta — a chi telefona per un
 *  weekend intero servirebbero quattro gesti — e non una persona per volta:
 *  il ponte di Ferragosto in cui non c'è nessuno dei tre si segna in una
 *  passata sola, cosa che un calendario per persona non sa fare. */
export function DisponibilitaGriglia({
  days,
  regime,
  persone,
  dichiarazioni,
  indiceGiorno,
  onSceglieGiorno,
  conTurno,
}: {
  days: string[];
  regime: RegimeChiamata;
  /** Solo chi è a chiamata, già passato per la ricerca e per i filtri del
   *  tabellone: chi cerca un nome qui si aspetta la stessa risposta di là. */
  persone: { id: string; name: string }[];
  dichiarazioni: Disponibilita[];
  indiceGiorno: number;
  onSceglieGiorno: (i: number) => void;
  /** Ha già un turno quel giorno: la disponibilità si segna guardando dove
   *  la persona è impegnata, non a memoria. */
  conTurno: (profileId: string, day: string) => boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [scelte, setScelte] = React.useState<Set<string>>(new Set());
  const [oreAperte, setOreAperte] = React.useState(false);
  const [dalle, setDalle] = React.useState("09:00");
  const [alle, setAlle] = React.useState("13:00");
  const [nota, setNota] = React.useState("");

  const verso = versoDelRegime(regime) ?? "non_posso";
  const oggi = oggiCivile();
  const giornoScelto = days[indiceGiorno] ?? days[0];

  const perPersona = React.useMemo(() => {
    const map = new Map<string, Dichiarazione[]>();
    for (const d of dichiarazioni) {
      const riga: Dichiarazione = {
        giorno: d.giorno,
        dalle: d.dalle,
        alle: d.alle,
        verso: d.verso,
      };
      const lista = map.get(d.profile_id);
      if (lista) lista.push(riga);
      else map.set(d.profile_id, [riga]);
    }
    return map;
  }, [dichiarazioni]);

  const statoDi = (profileId: string, giorno: string): StatoGiorno | null =>
    statoDelGiorno({
      regime,
      dichiarazioni: perPersona.get(profileId) ?? [],
      giorno,
    });

  const chiave = (profileId: string, giorno: string) => `${profileId}|${giorno}`;

  const alterna = (profileId: string, giorno: string) => {
    if (giorno < oggi) return;
    setScelte((prima) => {
      const dopo = new Set(prima);
      const k = chiave(profileId, giorno);
      if (dopo.has(k)) dopo.delete(k);
      else dopo.add(k);
      return dopo;
    });
  };

  /** Le caselle scelte, raggruppate per persona: le azioni si mandano una
   *  per persona, ed è la forma in cui le vuole la Server Action. */
  const perChi = () => {
    const map = new Map<string, string[]>();
    for (const k of scelte) {
      const [id, giorno] = k.split("|");
      const lista = map.get(id);
      if (lista) lista.push(giorno);
      else map.set(id, [giorno]);
    }
    return [...map.entries()];
  };

  const quantePersone = new Set([...scelte].map((k) => k.split("|")[0])).size;

  const finito = (messaggio: string) => {
    setScelte(new Set());
    setOreAperte(false);
    setNota("");
    toast.success(messaggio);
    router.refresh();
  };

  /** Manda la stessa azione a tutte le persone scelte, e si ferma al primo
   *  no. Fermarsi non è pigrizia: gli errori qui sono uno solo — il regime
   *  cambiato sotto i piedi, o un giorno passato mentre la pagina era aperta
   *  — e riguarderebbero tutte le righe allo stesso modo. */
  const manda = (
    azione: (profileId: string, giorni: string[]) => Promise<{ ok: boolean; error?: string }>,
    messaggio: string,
  ) =>
    start(async () => {
      for (const [id, giorni] of perChi()) {
        const esito = await azione(id, giorni);
        if (!esito.ok) return void toast.error(esito.error ?? "Non è riuscito.");
      }
      finito(messaggio);
    });

  const segnaIntero = () =>
    manda(
      (profile_id, giorni) =>
        segnaDisponibilita({ profile_id, giorni, dalle: null, alle: null, nota }),
      scelte.size === 1 ? "Segnato." : `${scelte.size} caselle segnate.`,
    );

  const segnaOre = () =>
    manda(
      (profile_id, giorni) =>
        segnaDisponibilita({ profile_id, giorni, dalle, alle, nota }),
      "Ore segnate.",
    );

  const togli = () =>
    manda(
      (profile_id, giorni) => togliDisponibilita({ profile_id, giorni }),
      "Tolto.",
    );

  if (persone.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
        <CalendarClock className="mx-auto size-6 text-faint" />
        <p className="mt-2 text-[14px] font-medium">Nessuno lavora a chiamata</p>
        <p className="mt-1 text-[13px] text-muted">
          Questa vista è di chi ha «a chiamata» nella sua scheda. Il tipo di
          contratto si sceglie in Squadra.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted">
        {verso === "non_posso" ? (
          <>
            Le caselle segnate sono i giorni in cui la persona{" "}
            <strong className="font-medium text-text">non è disponibile</strong>:
            lì l&apos;app non ti lascia dare turni. Tutte le altre sono libere.
          </>
        ) : (
          <>
            Le caselle segnate sono i giorni in cui la persona{" "}
            <strong className="font-medium text-text">è disponibile</strong>:
            solo lì le puoi dare turni. Tutte le altre sono chiuse.
          </>
        )}{" "}
        Tocca le caselle — anche di persone diverse — e poi scegli cosa farne.
      </p>

      {/* ---------------- schermo grande: la settimana intera ---------------- */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:block">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[64rem]"
            style={{ gridTemplateColumns: "14rem repeat(7, minmax(0, 1fr))" }}
          >
            <div className="sticky left-0 z-20 border-b border-border bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-faint">
              A chiamata
            </div>
            {days.map((day) => {
              const d = fromISODate(day);
              const today = isToday(d);
              return (
                <div
                  key={day}
                  className={cn(
                    "border-b border-l border-border bg-surface-2 px-3 py-2.5 text-center",
                    today && "bg-accent-soft",
                  )}
                >
                  <p
                    className={cn(
                      "text-[12px] font-medium capitalize",
                      today ? "text-accent" : "text-faint",
                    )}
                  >
                    {dayShort(d)}
                  </p>
                  <p
                    className={cn(
                      "text-[15px] font-semibold tabular-nums",
                      today && "text-accent",
                    )}
                  >
                    {d.getDate()}
                  </p>
                </div>
              );
            })}

            {persone.map((p) => (
              <React.Fragment key={p.id}>
                <div className="sticky left-0 z-10 flex items-center border-b border-border bg-surface px-4 py-2">
                  <p className="truncate text-[14px] font-medium">{p.name}</p>
                </div>
                {days.map((day) => {
                  const stato = statoDi(p.id, day);
                  const passato = day < oggi;
                  const scelta = scelte.has(chiave(p.id, day));
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={passato}
                      onClick={() => alterna(p.id, day)}
                      aria-pressed={scelta}
                      aria-label={`${p.name}, ${dayLong(fromISODate(day))}${stato ? ` — ${descriviStato(stato)}` : ""}`}
                      title={stato ? descriviStato(stato) : undefined}
                      className={cn(
                        "relative flex min-h-[3.25rem] flex-col justify-center gap-1 border-b border-l border-border p-1.5 text-left transition-colors",
                        passato ? "opacity-40" : "hover:bg-surface-2",
                        isToday(fromISODate(day)) && "bg-accent-soft/30",
                        scelta && "ring-2 ring-inset ring-accent",
                      )}
                    >
                      <Pastiglia stato={stato} verso={verso} />
                      {conTurno(p.id, day) ? (
                        <span className="text-[10.5px] text-faint">
                          ha un turno
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- telefono: un giorno alla volta ---------------- */}
      <div className="lg:hidden">
        <StrisciaGiorni
          days={days}
          indice={indiceGiorno}
          onSceglie={onSceglieGiorno}
          segnati={(day) => persone.some((p) => Boolean(statoDi(p.id, day)))}
        />

        <p className="mt-3 text-[13px] capitalize text-muted">
          {dayLong(fromISODate(giornoScelto))}
        </p>

        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          {persone.map((p) => {
            const stato = statoDi(p.id, giornoScelto);
            const passato = giornoScelto < oggi;
            const scelta = scelte.has(chiave(p.id, giornoScelto));
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={passato}
                  onClick={() => alterna(p.id, giornoScelto)}
                  aria-pressed={scelta}
                  className={cn(
                    "tap flex w-full items-center gap-3 px-3.5 py-3 text-left",
                    passato ? "opacity-40" : "hover:bg-surface-2",
                    scelta && "bg-accent-soft",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                    {p.name}
                    {conTurno(p.id, giornoScelto) ? (
                      <span className="ml-1.5 text-[12px] font-normal text-faint">
                        ha un turno
                      </span>
                    ) : null}
                  </span>
                  <Pastiglia stato={stato} verso={verso} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ------------------------------------ la barra di quello che hai scelto */}
      {scelte.size > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 shadow-float backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <p className="mr-auto text-[13px] font-medium">
              {scelte.size === 1 ? "1 casella scelta" : `${scelte.size} caselle scelte`}
              {quantePersone > 1 ? (
                <span className="text-muted"> · {quantePersone} persone</span>
              ) : null}
            </p>
            <Button size="sm" onClick={segnaIntero} loading={pending} disabled={pending}>
              <Check className="size-3.5" />
              {verso === "non_posso" ? "Non è disponibile" : "È disponibile"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOreAperte(true)}
              disabled={pending}
            >
              <Clock className="size-3.5" />
              Solo alcune ore
            </Button>
            <Button size="sm" variant="danger" onClick={togli} disabled={pending}>
              <Trash2 className="size-3.5" />
              Togli
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Lascia stare"
              onClick={() => setScelte(new Set())}
              disabled={pending}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- le ore --- */}
      <Modal
        open={oreAperte}
        onOpenChange={setOreAperte}
        title={verso === "non_posso" ? "Non disponibile in queste ore" : "Disponibile in queste ore"}
        description={
          scelte.size === 1
            ? "Vale per la casella che hai scelto."
            : `Le stesse ore su tutte e ${scelte.size} le caselle scelte.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOreAperte(false)} disabled={pending}>
              Lascia stare
            </Button>
            <Button onClick={segnaOre} loading={pending} disabled={pending}>
              Segna le ore
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Dalle – alle" htmlFor="disp-dalle">
            <div className="flex items-center gap-2">
              <Input
                id="disp-dalle"
                type="time"
                value={dalle}
                onChange={(e) => setDalle(e.target.value)}
                className="w-32"
              />
              <span className="text-faint">–</span>
              <Input
                type="time"
                value={alle}
                onChange={(e) => setAlle(e.target.value)}
                className="w-32"
                aria-label="Fine"
              />
            </div>
          </Field>
          <p className="text-[12.5px] text-faint">
            Se l&apos;ora di fine è prima di quella di inizio, la fascia
            scavalca la mezzanotte — come per i turni.
          </p>
          <Field
            label="Una riga per ricordartelo"
            htmlFor="disp-nota"
            hint="Facoltativa. La legge chi apre questa casella, non cambia niente da sola."
          >
            <Textarea
              id="disp-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ha lezione fino alle 18"
              maxLength={200}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** Cosa c'è scritto in una casella. Vuota vuol dire il contrario nei due
 *  regimi — nella lista nera è un giorno libero, nella bianca è un giorno in
 *  cui non si può dare niente — e per questo la casella vuota della lista
 *  bianca non resta muta. */
function Pastiglia({
  stato,
  verso,
}: {
  stato: StatoGiorno | null;
  verso: "non_posso" | "posso";
}) {
  if (!stato) {
    if (verso === "non_posso") return null;
    return (
      <span className="truncate rounded px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-faint">
        nessuna disp.
      </span>
    );
  }

  return (
    <span
      className={cn(
        "truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight",
        verso === "non_posso"
          ? "bg-danger-soft text-danger"
          : "bg-success-soft text-success",
      )}
    >
      {stato.intero
        ? verso === "non_posso"
          ? "non c'è"
          : "disponibile"
        : stato.fasce.map((f) => `${f.dalle}–${f.alle}`).join(" ")}
    </span>
  );
}

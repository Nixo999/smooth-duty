"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  PencilLine,
  Redo2,
  Settings2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { eliminaTurno, salvaTurno } from "@/app/(app)/turni/actions";
import { RepartiSheet } from "@/components/supervisione/reparti-sheet";
import {
  ShiftDialog,
  shiftToDraft,
  type GestoreTurni,
  type ShiftDraft,
} from "@/components/turni/shift-dialog";
import { Button } from "@/components/ui/button";
import { GruppoModifica } from "@/components/ui/gruppo-modifica";
import { dayLong, durationMinutes, fromISODate, isToday, toISODate } from "@/lib/date";
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  intervalloVisibile,
  minutiDa,
  oraDa,
  segmentiDelGiorno,
  MINUTI_GIORNO,
  type Buco,
  type Segmento,
} from "@/lib/supervisione/copertura";
import {
  applicaTrascina,
  orariDa,
  type TipoTrascina,
} from "@/lib/supervisione/trascina";
import type { AbsenceDay, CoverageBand, Department, Profile, Shift } from "@/lib/types";
import {
  compatta,
  proietta,
  turnoBozzaDa,
  type Operazione,
  type TurnoBozza,
} from "@/lib/turni-staging";
import { addDays } from "@/lib/week";
import { cn } from "@/lib/utils";

const SENZA_REPARTO = "__senza__";

/** I colori delle persone, in quest'ordine in ogni reparto: azzurro,
 *  giallo, rosso, verde, rosa, e poi altri — tutti pastello, li smorza il
 *  foglio di stile. La prima riga di ogni reparto e' sempre azzurra, la
 *  seconda sempre gialla: cosi' due tabelle si leggono con lo stesso
 *  occhio, invece di assegnare a ciascuno un colore a caso. */
const TINTE_RIGHE = [200, 48, 5, 140, 330, 270, 25, 178, 225, 105, 300, 80];

/** Chiave del salvataggio del filtro reparti. E' una preferenza di chi
 *  guarda, non un dato: per questo sta nel browser e non sul database. */
const REPARTI_SPENTI = "turni:supervisione:reparti-spenti";

/* Un piccolo store sul localStorage, letto con useSyncExternalStore: e' il
 * modo previsto per uno stato che vive fuori da React. Sul server e nel
 * primo disegno vale l'insieme vuoto (tutto acceso), e React riallinea da
 * solo dopo il montaggio — senza errori di idratazione ne' setState negli
 * effetti. */
const TUTTO_ACCESO: ReadonlySet<string> = new Set();
let spentiCache: ReadonlySet<string> | null = null;
const ascoltatori = new Set<() => void>();

function leggiSpenti(): ReadonlySet<string> {
  if (spentiCache === null) {
    try {
      const grezzo = localStorage.getItem(REPARTI_SPENTI);
      spentiCache = new Set(grezzo ? (JSON.parse(grezzo) as string[]) : []);
    } catch {
      // Salvataggio illeggibile: si riparte con tutto acceso.
      spentiCache = new Set();
    }
  }
  return spentiCache;
}

function sottoscriviSpenti(avvisa: () => void) {
  ascoltatori.add(avvisa);
  return () => {
    ascoltatori.delete(avvisa);
  };
}

function commutaReparto(id: string) {
  const dopo = new Set(leggiSpenti());
  if (dopo.has(id)) dopo.delete(id);
  else dopo.add(id);
  spentiCache = dopo;
  try {
    localStorage.setItem(REPARTI_SPENTI, JSON.stringify([...dopo]));
  } catch {
    // Senza spazio o in navigazione privata: il filtro vale comunque
    // finche' la pagina resta aperta.
  }
  for (const avvisa of ascoltatori) avvisa();
}

type Riga = { chiave: string; nome: string; tinta: number; segmenti: Segmento[] };

export function Supervisione({
  giorno,
  giornoPrima,
  persone,
  turni,
  reparti,
  fasce,
  assenze,
  repartoFrequente,
  mioId,
  capo,
}: {
  giorno: string;
  giornoPrima: string;
  persone: Profile[];
  turni: Shift[];
  reparti: Department[];
  fasce: CoverageBand[];
  /** Solo i giorni: qui il motivo non arriva nemmeno dal server. */
  assenze: AbsenceDay[];
  /** Per ciascuna persona, il reparto in cui lavora piu' spesso. */
  repartoFrequente: Record<string, string>;
  /** Il profilo di chi sta guardando: decide quale reparto viene primo. */
  mioId: string;
  capo: boolean;
}) {
  const router = useRouter();
  const [impostazioni, setImpostazioni] = React.useState(false);
  const nascosti = React.useSyncExternalStore(
    sottoscriviSpenti,
    leggiSpenti,
    () => TUTTO_ACCESO,
  );
  const [inCorso, startNavigazione] = React.useTransition();
  const [daModificare, setDaModificare] = React.useState<ShiftDraft | null>(null);

  /* -------------------------------------------- modifiche in sospeso ----
   * Da qui si modifica solo premendo Modifica: le barre diventano
   * premibili e trascinabili, le modifiche restano locali, e partono tutte
   * insieme con «Pubblica modifiche». Le frecce tolgono e rimettono una
   * modifica alla volta. */
  const [sospese, setSospese] = React.useState<{
    attivo: boolean;
    fatte: Operazione[];
    annullate: Operazione[];
  }>({ attivo: false, fatte: [], annullate: [] });
  const [inApplica, startApplica] = React.useTransition();

  /** I turni che si vedono: quelli veri, o quelli con le modifiche in
   *  sospeso applicate sopra. Niente memo: deve stare prima del gestore
   *  che la usa, e la proiezione costa meno del ragionarci. */
  const turniVivi = sospese.attivo ? proietta(turni, sospese.fatte) : turni;

  const inputDa = (id: string | undefined, d: Omit<TurnoBozza, "id">) => ({
    id,
    profile_id: d.profile_id,
    department_id: d.department_id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    title: d.title ?? "",
    location: d.location ?? "",
    notes: d.notes ?? "",
  });

  const gestore: GestoreTurni = {
    salva: (id, dati) => {
      if (!id) return { ok: false, error: "Da qui si modificano turni esistenti." };
      setSospese((s0) => ({
        ...s0,
        fatte: [...s0.fatte, { tipo: "salva", dopo: { id, ...dati } }],
        annullate: [],
      }));
      return { ok: true };
    },
    elimina: (id) => {
      const turno = turniVivi.find((t) => t.id === id);
      if (!turno) return { ok: false, error: "Turno non trovato." };
      setSospese((s0) => ({
        ...s0,
        fatte: [...s0.fatte, { tipo: "elimina", prima: turnoBozzaDa(turno) }],
        annullate: [],
      }));
      return { ok: true };
    },
  };

  const pubblicaModifiche = () =>
    startApplica(async () => {
      const { daEliminare, daSalvare } = compatta(sospese.fatte);
      let errori = 0;
      let richieste = 0;
      for (const id of daEliminare) {
        const r = await eliminaTurno(id);
        if (!r.ok) errori++;
      }
      for (const t of daSalvare) {
        const r = await salvaTurno(inputDa(t.creazione ? undefined : t.id, t));
        if (!r.ok) errori++;
        else if (r.richiede) richieste++;
      }
      setSospese({ attivo: false, fatte: [], annullate: [] });
      router.refresh();
      if (errori > 0) {
        toast.error(
          `${errori} ${errori === 1 ? "modifica non applicata" : "modifiche non applicate"}: controlla il tabellone.`,
        );
      } else {
        toast.success(
          richieste > 0
            ? `Modifiche applicate. ${richieste} ${richieste === 1 ? "turno vale" : "turni valgono"} da subito, ma ${richieste === 1 ? "l'interessato può rifiutarlo" : "gli interessati possono rifiutarli"}: se succede lo trovi nei messaggi, nei Turni.`
            : "Modifiche applicate.",
        );
      }
    });

  /** Il turno intero dietro una barra. La barra sa solo che ore occupa in
   *  questo giorno — di un 18:00-02:00 vede mezzo pezzo — mentre per
   *  modificarlo servono la data e gli orari veri, che sono quelli del
   *  turno da cui il pezzo e' stato ritagliato. */
  const perId = new Map(turniVivi.map((t) => [t.id, t]));

  const apri = (turnoId: string) => {
    if (!sospese.attivo) return;
    const turno = perId.get(turnoId);
    if (turno) setDaModificare(shiftToDraft(turno));
  };

  /* ---------------------------------------------------- trascinamento ----
   * In Modifica le barre si aggiustano direttamente: i bordi cambiano
   * l'orario di inizio o di fine, il centro sposta il turno — anche in un
   * altro reparto, ma solo dove la persona sa lavorare. Ogni rilascio e'
   * un'operazione in sospeso come le altre: le frecce la tolgono e la
   * rimettono, e niente parte prima di «Pubblica modifiche». */
  const [repartoEvidenziato, setRepartoEvidenziato] = React.useState<string | null>(null);

  const applicaTrascinamento = (
    turnoId: string,
    orari: { start_time: string; end_time: string },
    repartoId?: string,
  ) => {
    const turno = perId.get(turnoId);
    if (!turno) return;
    const dati = turnoBozzaDa(turno);
    setSospese((s0) => ({
      ...s0,
      fatte: [
        ...s0.fatte,
        {
          tipo: "salva",
          dopo: {
            ...dati,
            ...orari,
            ...(repartoId !== undefined ? { department_id: repartoId } : {}),
          },
        },
      ],
      annullate: [],
    }));
  };

  const vai = (g: string) =>
    startNavigazione(() => router.push(`/supervisione?g=${g}`, { scroll: false }));

  const dati = (() => {
    const segmenti = segmentiDelGiorno(turniVivi, persone, giorno, giornoPrima, assenze);
    const fasceOggi = fasceDelGiorno(
      fasce.map((f) => ({ ...f, weekdays: f.weekdays ?? [] })),
      giorno,
    );

    // Un asse solo per tutti i reparti: con scale diverse due colonne alla
    // stessa altezza vorrebbero dire ore diverse, ed e' proprio il confronto
    // che questa pagina deve permettere.
    const vista = intervalloVisibile(segmenti, fasceOggi);

    const conSegmenti = new Set(segmenti.map((s) => s.departmentId ?? SENZA_REPARTO));

    let elenco: { id: string; nome: string; tinta: number }[] = [
      ...reparti.map((r) => ({ id: r.id, nome: r.name, tinta: r.hue })),
      ...(conSegmenti.has(SENZA_REPARTO)
        ? [{ id: SENZA_REPARTO, nome: "Senza reparto", tinta: 220 }]
        : []),
    ];

    // Al dipendente il suo reparto va per primo: apre la pagina per sapere
    // chi c'e' con lui, non per scorrere reparti altrui. "Suo" e' quello del
    // turno che ha quel giorno — un turno puo' spostarlo di reparto — e in
    // un giorno di riposo quello di appartenenza. Il responsabile tiene
    // l'ordine che ha scelto lui nelle impostazioni.
    if (!capo) {
      const mieiTurni = turniVivi
        .filter((t) => t.profile_id === mioId && t.date === giorno)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const mioPrincipale =
        persone.find((p) => p.id === mioId)?.department_id ?? null;
      const mio =
        mieiTurni.length > 0
          ? (mieiTurni[0].department_id ?? mioPrincipale ?? SENZA_REPARTO)
          : mioPrincipale;
      if (mio) {
        elenco = [
          ...elenco.filter((e) => e.id === mio),
          ...elenco.filter((e) => e.id !== mio),
        ];
      }
    }

    const gruppi = elenco.map((reparto) => {
      const suoi = segmenti.filter(
        (s) => (s.departmentId ?? SENZA_REPARTO) === reparto.id,
      );
      const sueFasce = fasceOggi.filter((f) => f.departmentId === reparto.id);

      // Una riga per persona: chi fa un turno spezzato resta su una riga sola,
      // con due barre. I turni scoperti prendono una riga per ciascuno.
      const perRiga = new Map<string, Riga>();
      for (const s of suoi) {
        const chiave = s.profileId ?? `scoperto:${s.turnoId}`;
        const esistente = perRiga.get(chiave);
        if (esistente) esistente.segmenti.push(s);
        else
          perRiga.set(chiave, {
            chiave,
            nome: s.nome,
            tinta: 0,
            segmenti: [s],
          });
      }

      const righe = [...perRiga.values()].sort(
        (a, b) => a.segmenti[0].da - b.segmenti[0].da || a.nome.localeCompare(b.nome),
      );
      // Il colore segue la posizione, non la persona: prima riga azzurra,
      // seconda gialla, uguale in ogni reparto.
      righe.forEach((riga, i) => {
        riga.tinta = TINTE_RIGHE[i % TINTE_RIGHE.length];
      });

      const fette = copertura(suoi, sueFasce, vista.da, vista.a);
      return {
        ...reparto,
        righe,
        fasce: sueFasce,
        fette,
        buchi: calcolaBuchi(fette),
        persone: new Set(
          suoi.filter((s) => s.profileId && !s.assenza).map((s) => s.profileId),
        ).size,
      };
    });

    return { vista, gruppi };
  })();

  const { vista, gruppi } = dati;
  const visibili = gruppi.filter((g) => !nascosti.has(g.id));
  const ore = (vista.a - vista.da) / 60;
  const larghezzaMinima = Math.max(560, ore * 62);
  const pct = (m: number) => ((m - vista.da) / (vista.a - vista.da)) * 100;

  const oreIntere: number[] = [];
  for (let m = Math.ceil(vista.da / 60) * 60; m <= vista.a; m += 60) oreIntere.push(m);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Giorno precedente"
              onClick={() => vai(addDays(giorno, -1))}
              className="tap grid h-full w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Giorno successivo"
              onClick={() => vai(addDays(giorno, 1))}
              className="tap grid h-full w-9 place-items-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <p
            className="text-[15px] font-semibold capitalize tracking-tight"
            aria-live="polite"
            data-pending={inCorso || undefined}
          >
            {dayLong(fromISODate(giorno))}
          </p>

          {!isToday(fromISODate(giorno)) ? (
            <Button variant="ghost" size="sm" onClick={() => vai(toISODate(new Date()))}>
              Oggi
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Come nei Turni: i comandi che cambiano i turni stanno nel loro
              recinto, distinti da filtri e impostazioni della pagina. */}
          {capo ? (
            <GruppoModifica>
              {sospese.attivo ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() =>
                      setSospese((s0) => {
                        const fatte = [...s0.fatte];
                        const ultima = fatte.pop();
                        return ultima
                          ? { ...s0, fatte, annullate: [...s0.annullate, ultima] }
                          : s0;
                      })
                    }
                    disabled={sospese.fatte.length === 0 || inApplica}
                    aria-label="Togli l'ultima modifica"
                    title="Togli l'ultima modifica"
                  >
                    <Undo2 className="size-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() =>
                      setSospese((s0) => {
                        const annullate = [...s0.annullate];
                        const ultima = annullate.pop();
                        return ultima
                          ? { ...s0, annullate, fatte: [...s0.fatte, ultima] }
                          : s0;
                      })
                    }
                    disabled={sospese.annullate.length === 0 || inApplica}
                    aria-label="Rimetti la modifica tolta"
                    title="Rimetti la modifica tolta"
                  >
                    <Redo2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSospese({ attivo: false, fatte: [], annullate: [] })
                    }
                    disabled={inApplica}
                    title="Scarta tutte le modifiche non pubblicate"
                  >
                    <X className="size-3.5" />
                    Elimina le modifiche
                  </Button>
                  <Button
                    size="sm"
                    onClick={pubblicaModifiche}
                    loading={inApplica}
                    disabled={sospese.fatte.length === 0}
                  >
                    Pubblica modifiche
                    {sospese.fatte.length > 0 ? (
                      <span className="rounded-full bg-accent-fg/20 px-1.5 text-[11px] tabular-nums">
                        {sospese.fatte.length}
                      </span>
                    ) : null}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSospese({ attivo: true, fatte: [], annullate: [] })}
                  title="Modifica i turni da qui: valgono solo quando li pubblichi"
                >
                  <PencilLine className="size-3.5" />
                  Modifica
                </Button>
              )}
            </GruppoModifica>
          ) : null}
          {gruppi.length > 1 ? (
            <FiltroReparti
              gruppi={gruppi}
              nascosti={nascosti}
              onCommuta={commutaReparto}
            />
          ) : null}
          {capo ? (
            <Button variant="secondary" size="sm" onClick={() => setImpostazioni(true)}>
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">Reparti e coperture</span>
              <span className="sm:hidden">Reparti</span>
            </Button>
          ) : null}
        </div>
      </div>

      {gruppi.length === 0 ? (
        <Vuoto capo={capo} onApri={() => setImpostazioni(true)} />
      ) : (
        <div className="stagger space-y-4">
          {visibili.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
              Tutti i reparti sono spenti nel filtro.
            </p>
          ) : null}
          {visibili.map((g) => (
            <section
              key={g.id}
              // L'attributo dice al trascinamento su quale reparto sta
              // passando la barra; l'anello risponde solo quando il reparto
              // puo' accoglierla.
              data-reparto={g.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
                repartoEvidenziato === g.id && "border-accent ring-2 ring-accent",
              )}
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="pastiglia-reparto rounded-full px-2.5 py-1 text-[12.5px] font-semibold uppercase tracking-wide"
                    style={{ ["--tinta" as string]: g.tinta }}
                  >
                    {g.nome}
                  </span>
                  <span className="text-[12.5px] text-muted">
                    {g.persone} {g.persone === 1 ? "persona" : "persone"}
                  </span>
                </div>
                {capo ? (
                  <Stato buchi={g.buchi} conRegole={g.fasce.length > 0} />
                ) : null}
              </header>

              <div className="overflow-x-auto">
                <div style={{ minWidth: larghezzaMinima }} className="px-4 pb-3 pt-2">
                  {/* asse delle ore */}
                  <div className="relative mb-1.5 h-4">
                    {oreIntere.map((m) => (
                      <span
                        key={m}
                        className="absolute -translate-x-1/2 text-[11px] tabular-nums text-faint"
                        style={{ left: `${pct(m)}%` }}
                      >
                        {oraDa(m).slice(0, 2)}
                      </span>
                    ))}
                  </div>

                  <div className="space-y-1">
                    {g.righe.length === 0 ? (
                      <p className="py-3 text-center text-[13px] text-faint">
                        Nessuno in turno in questo giorno
                      </p>
                    ) : (
                      g.righe.map((riga) => (
                        <Corsia key={riga.chiave} ore={oreIntere} pct={pct}>
                          {riga.segmenti.map((s) => {
                            const turno = perId.get(s.turnoId);
                            const persona = s.profileId
                              ? persone.find((p) => p.id === s.profileId)
                              : undefined;
                            return (
                              <BarraTurno
                                key={s.turnoId}
                                s={s}
                                nome={riga.nome}
                                tinta={riga.tinta}
                                // Solo il no si segnala qui. Questa pagina
                                // risponde a «la giornata e' coperta?», e un
                                // turno rifiutato e' un buco che sta per
                                // aprirsi; chi ha detto si' e chi non ha
                                // ancora risposto si guardano nei Turni,
                                // persona per persona.
                                rifiutato={capo && Boolean(turno?.rifiutato_at)}
                                apribile={capo && sospese.attivo}
                                // Si trascina solo il turno che comincia nel
                                // giorno mostrato: della coda di un turno di
                                // ieri qui si vede mezzo pezzo, e gli orari
                                // veri si cambiano dal pannello. E non quello
                                // di chi e' assente: il salvataggio lo
                                // rifiuterebbe, e se ne accorgerebbe solo
                                // alla pubblicazione, quando ormai la barra
                                // sembra spostata.
                                trascinabile={
                                  capo &&
                                  sospese.attivo &&
                                  !!turno &&
                                  turno.date === giorno &&
                                  !s.assenza
                                }
                                inizio={turno ? minutiDa(turno.start_time) : 0}
                                durata={
                                  turno
                                    ? durationMinutes(turno.start_time, turno.end_time)
                                    : 0
                                }
                                repartoCorrente={g.id}
                                // Dove la barra puo' traslocare: i reparti in
                                // cui la persona sa lavorare. Un turno
                                // scoperto non ha vincoli: lo fara' chi
                                // verra' scelto.
                                ammessi={
                                  s.profileId
                                    ? new Set(
                                        (persona
                                          ? [persona.department_id, ...persona.reparti]
                                          : []
                                        ).filter((r): r is string => Boolean(r)),
                                      )
                                    : new Set(reparti.map((r) => r.id))
                                }
                                vista={vista}
                                pct={pct}
                                onApri={apri}
                                onCommit={applicaTrascinamento}
                                onBersaglio={setRepartoEvidenziato}
                              />
                            );
                          })}
                        </Corsia>
                      ))
                    )}
                  </div>

                  {/* quanto serve, e quanto e' coperto */}
                  {capo || g.fasce.length > 0 ? (
                    <div className="mt-3 border-t border-border pt-2.5">
                      {g.fasce.length > 0 ? (
                        <Corsia ore={oreIntere} pct={pct} alta={false}>
                          {g.fasce.map((f) => (
                            <span
                              key={`${f.id}-${f.da}`}
                              className="absolute inset-y-0 flex items-center justify-center overflow-hidden rounded border border-dashed border-border-strong bg-surface-3 px-1.5 text-[11px] text-muted"
                              style={{
                                left: `${pct(f.da)}%`,
                                width: `${pct(f.a) - pct(f.da)}%`,
                              }}
                              title={`${f.nome}: servono ${f.richiesti} · ${oraDa(f.da)}–${oraDa(f.a)}`}
                            >
                              <span className="truncate">
                                {f.nome} · {f.richiesti}
                              </span>
                            </span>
                          ))}
                        </Corsia>
                      ) : null}

                      {/* Il verde e il rosso sono un giudizio sulla giornata:
                          li legge chi la deve rimediare. Al dipendente resta chi
                          c'e' in turno con lui. */}
                      {capo ? (
                        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-3">
                          {g.fette.map((f) => (
                            <span
                              key={f.da}
                              className={cn(
                                "h-full",
                                f.richiesti === 0
                                  ? "bg-transparent"
                                  : f.presenti >= f.richiesti
                                    ? "bg-success"
                                    : "bg-danger",
                              )}
                              style={{ width: `${(100 * (f.a - f.da)) / (vista.a - vista.da)}%` }}
                              title={`${oraDa(f.da)}–${oraDa(f.a)}: ${f.presenti} presenti su ${f.richiesti} richiesti`}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

            </section>
          ))}
        </div>
      )}

      <Legenda capo={capo} />

      {capo ? (
        <ShiftDialog
          draft={daModificare}
          profiles={persone}
          departments={reparti}
          repartoFrequente={repartoFrequente}
          gestore={gestore}
          onClose={() => setDaModificare(null)}
        />
      ) : null}

      {impostazioni ? (
        <RepartiSheet
          reparti={reparti}
          fasce={fasce}
          onClose={() => setImpostazioni(false)}
        />
      ) : null}
    </div>
  );
}

/** Una corsia della linea del tempo, con le righe verticali delle ore. */
function Corsia({
  ore,
  pct,
  alta = true,
  children,
}: {
  ore: number[];
  pct: (m: number) => number;
  alta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", alta ? "h-8" : "h-6")}>
      {ore.map((m) => (
        <span
          key={m}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: `${pct(m)}%` }}
        />
      ))}
      {children}
    </div>
  );
}

/** Quello che serve a seguire un dito, dal tocco al rilascio. Vive in un
 *  ref, non nello stato: cambia a ogni pixel e non deve ridisegnare niente
 *  — ridisegna solo l'anteprima, che cambia a ogni scatto. */
type CorsoDiTrascinamento = {
  tipo: TipoTrascina;
  puntatore: number;
  x0: number;
  y0: number;
  minutiPerPixel: number;
  mosso: boolean;
  /** Il reparto ammesso su cui la barra sta passando, se e' un altro. */
  bersaglio: string | null;
};

/** Una barra della linea del tempo. Fuori da Modifica si guarda e basta; in
 *  Modifica il tocco la apre nel pannello e il trascinamento la aggiusta:
 *  i bordi cambiano l'orario di inizio o di fine, il centro la sposta con
 *  le stesse ore — anche in un altro reparto, se la persona ci sa
 *  lavorare. Qui vive solo l'anteprima mentre il dito e' giu': il rilascio
 *  consegna la modifica al genitore, che la mette fra quelle in sospeso. */
function BarraTurno({
  s,
  nome,
  tinta,
  rifiutato,
  apribile,
  trascinabile,
  inizio,
  durata,
  repartoCorrente,
  ammessi,
  vista,
  pct,
  onApri,
  onCommit,
  onBersaglio,
}: {
  s: Segmento;
  nome: string;
  tinta: number;
  /** L'interessato ha detto no: il turno c'è ancora, ma sta per non
   *  esserci più. */
  rifiutato: boolean;
  apribile: boolean;
  trascinabile: boolean;
  /** Minuti veri del turno intero — inizio dalla mezzanotte del suo giorno
   *  e durata — non il pezzo ritagliato sull'asse, che di un 18:00–02:00
   *  vede solo meta'. */
  inizio: number;
  durata: number;
  repartoCorrente: string;
  /** I reparti in cui questa barra puo' traslocare. */
  ammessi: ReadonlySet<string>;
  vista: { da: number; a: number };
  pct: (m: number) => number;
  onApri: (turnoId: string) => void;
  onCommit: (
    turnoId: string,
    orari: { start_time: string; end_time: string },
    repartoId?: string,
  ) => void;
  onBersaglio: (repartoId: string | null) => void;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const corso = React.useRef<CorsoDiTrascinamento | null>(null);
  // Dopo un trascinamento col mouse il browser emette comunque un click:
  // non deve aprire il pannello per giunta. Da telefono quel click non
  // arriva mai, quindi il segno non si puo' lasciare in attesa di essere
  // consumato: lo azzera il gesto successivo.
  const soppresso = React.useRef(false);
  const [anteprima, setAnteprima] = React.useState<{
    inizio: number;
    durata: number;
  } | null>(null);

  const inizia = (tipo: TipoTrascina, e: React.PointerEvent) => {
    if (!trascinabile || e.button !== 0 || corso.current) return;
    soppresso.current = false;
    // La corsia e' il metro: la sua larghezza in pixel copre l'intervallo
    // visibile, e da li' si sa quanti minuti vale un pixel.
    const corsia = ref.current?.parentElement;
    const larghezza = corsia?.getBoundingClientRect().width ?? 0;
    if (larghezza <= 0) return;
    corso.current = {
      tipo,
      puntatore: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      minutiPerPixel: (vista.a - vista.da) / larghezza,
      mosso: false,
      bersaglio: null,
    };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const muovi = (e: React.PointerEvent) => {
    const c = corso.current;
    if (!c || e.pointerId !== c.puntatore) return;
    const dx = e.clientX - c.x0;
    // La stessa soglia che i browser usano per distinguere un tocco da un
    // trascinamento. Piu' bassa, il tremolio del dito su un tocco fermo
    // diventerebbe un trascinamento da zero minuti: la barra non si
    // muoverebbe e il pannello non si aprirebbe, un tocco a vuoto.
    if (!c.mosso && Math.abs(dx) < 10 && Math.abs(e.clientY - c.y0) < 10) return;
    c.mosso = true;
    setAnteprima(applicaTrascina(c.tipo, inizio, durata, dx * c.minutiPerPixel));

    if (c.tipo !== "sposta") return;
    // Il reparto sotto il dito: la barra e' catturata ma sta ferma in
    // verticale, quindi appena il dito scende su un'altra scheda e' quella
    // a rispondere. Vale solo un reparto vero, diverso, e ammesso.
    const sotto = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-reparto]");
    const id = sotto instanceof HTMLElement ? (sotto.dataset.reparto ?? null) : null;
    const valido =
      id && id !== repartoCorrente && id !== SENZA_REPARTO && ammessi.has(id)
        ? id
        : null;
    if (valido !== c.bersaglio) {
      c.bersaglio = valido;
      onBersaglio(valido);
    }
  };

  const finisci = (e: React.PointerEvent) => {
    const c = corso.current;
    if (!c || e.pointerId !== c.puntatore) return;
    corso.current = null;
    setAnteprima(null);
    onBersaglio(null);
    if (!c.mosso) return;

    const dx = e.clientX - c.x0;
    const esito = applicaTrascina(c.tipo, inizio, durata, dx * c.minutiPerPixel);
    const reparto = c.tipo === "sposta" ? c.bersaglio : null;
    // Un trascinamento che riporta tutto dov'era non e' una modifica, e
    // nemmeno un motivo per mangiarsi il click: era un tocco storto, e
    // aprire il pannello e' quello che l'utente voleva.
    if (esito.inizio === inizio && esito.durata === durata && !reparto) return;
    soppresso.current = true;
    onCommit(s.turnoId, orariDa(esito.inizio, esito.durata), reparto ?? undefined);
  };

  const interrompi = (e: React.PointerEvent) => {
    if (corso.current?.puntatore !== e.pointerId) return;
    corso.current = null;
    setAnteprima(null);
    onBersaglio(null);
  };

  // L'anteprima e' in minuti veri e puo' sporgere dall'asse: il pezzo oltre
  // la mezzanotte si taglia come per ogni segmento, il resto puo' sbordare
  // di poco finche' il dito e' giu' — al rilascio l'asse si riadatta.
  const fine = anteprima ? anteprima.inizio + anteprima.durata : 0;
  const visDa = anteprima ? anteprima.inizio : s.da;
  const visA = anteprima ? Math.min(fine, MINUTI_GIORNO) : s.a;
  const finoADopo = anteprima ? fine > MINUTI_GIORNO : s.finoADopo;
  const daPrima = anteprima ? false : s.daPrima;
  const orario = anteprima
    ? `${oraDa(anteprima.inizio)}–${oraDa((anteprima.inizio + anteprima.durata) % MINUTI_GIORNO)}`
    : `${oraDa(s.da)}–${oraDa(s.a)}`;

  return (
    <button
      ref={ref}
      type="button"
      // Il dipendente la barra la guarda e basta: senza il bottone niente
      // cursore, niente fuoco da tastiera, niente da premere per sbaglio.
      disabled={!apribile}
      onClick={() => {
        if (soppresso.current) {
          soppresso.current = false;
          return;
        }
        onApri(s.turnoId);
      }}
      onPointerDown={(e) => inizia("sposta", e)}
      onPointerMove={muovi}
      onPointerUp={finisci}
      onPointerCancel={interrompi}
      className={cn(
        "group barra absolute inset-y-0 flex select-none items-center overflow-hidden rounded-md px-2 text-left",
        !s.profileId && "border-dashed",
        s.assenza && "assente",
        rifiutato && "ring-2 ring-danger",
        apribile && "tap cursor-pointer",
        trascinabile && !anteprima && "cursor-grab",
        anteprima && "z-10 cursor-grabbing shadow-float",
      )}
      style={{
        ["--tinta" as string]: tinta,
        left: `${pct(visDa)}%`,
        width: `${pct(visA) - pct(visDa)}%`,
        // Senza, sul telefono il trascinamento litigherebbe con lo
        // scorrimento orizzontale della corsia.
        touchAction: trascinabile ? "none" : undefined,
      }}
      title={`${nome} · ${oraDa(s.da)}–${oraDa(s.a)}${s.title ? ` · ${s.title}` : ""}${s.assenza ? " · assente, non conta" : ""}${rifiutato ? " · rifiutato: apri i messaggi nei Turni" : ""}${trascinabile ? " · tocca per modificare, trascina per aggiustare" : apribile ? " · tocca per modificare" : ""}`}
    >
      <span className="truncate text-[12px] font-semibold uppercase tracking-wide">
        {daPrima ? "◂ " : ""}
        {nome}
        {finoADopo ? " ▸" : ""}
      </span>
      <span className="orario ml-1.5 shrink-0 truncate text-[11px] tabular-nums opacity-70">
        {s.assenza ? "assente" : orario}
      </span>

      {trascinabile ? (
        <>
          {/* Le maniglie dei bordi: strette da vedere, larghe da prendere.
              Fermano la discesa dell'evento, altrimenti partirebbe anche lo
              spostamento dal centro.

              Mai oltre il 30% della barra per parte: su un turno di un
              quarto d'ora due maniglie da dieci pixel la coprirebbero
              tutta, e quel turno non si potrebbe piu' spostare — resterebbe
              solo da accorciare. */}
          <span
            aria-hidden
            onPointerDown={(e) => {
              e.stopPropagation();
              inizia("inizio", e);
            }}
            style={{ width: "min(10px, 30%)" }}
            className="absolute inset-y-0 left-0 cursor-ew-resize"
          >
            <span className="absolute inset-y-[7px] left-[3px] w-[3px] rounded-full bg-current opacity-30 transition-opacity group-hover:opacity-60" />
          </span>
          <span
            aria-hidden
            onPointerDown={(e) => {
              e.stopPropagation();
              inizia("fine", e);
            }}
            style={{ width: "min(10px, 30%)" }}
            className="absolute inset-y-0 right-0 cursor-ew-resize"
          >
            <span className="absolute inset-y-[7px] right-[3px] w-[3px] rounded-full bg-current opacity-30 transition-opacity group-hover:opacity-60" />
          </span>
        </>
      ) : null}
    </button>
  );
}

function Stato({ buchi, conRegole }: { buchi: Buco[]; conRegole: boolean }) {
  if (!conRegole) {
    return (
      <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[12px] text-muted">
        Nessuna regola di copertura
      </span>
    );
  }
  if (buchi.length === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
        <CheckCircle2 className="size-3.5" />
        Coperto
      </span>
    );
  }
  // Il dettaglio non sta piu' spalmato in fondo alla scheda: lo apre questo
  // bottone, e chi vuole solo il conto legge il numero e passa oltre.
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="tap flex cursor-pointer items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-medium text-danger"
        >
          <AlertTriangle className="size-3.5" />
          {buchi.length} {buchi.length === 1 ? "buco" : "buchi"}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-float data-[state=open]:animate-pop"
        >
          <ul className="space-y-0.5">
            {buchi.map((b) => (
              <li
                key={b.da}
                className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[13px] text-danger"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <strong className="tabular-nums">
                    {oraDa(b.da)}–{oraDa(b.a)}
                  </strong>{" "}
                  scoperto: servono {b.richiesti},{" "}
                  {b.presenti === 0
                    ? "non c'è nessuno"
                    : b.presenti === 1
                      ? "c'è una persona"
                      : `ce ne sono ${b.presenti}`}
                </span>
              </li>
            ))}
          </ul>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Legenda({ capo }: { capo: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px] text-muted">
      {/* Le tre voci sui colori spiegano una barra che il dipendente non
          vede: senza il suo grafico sono indovinelli. */}
      {capo ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-success" />
            abbastanza persone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-danger" />
            ne mancano
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-surface-3" />
            nessuna regola per quell&apos;ora
          </span>
        </>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span
          className="barra assente h-3 w-6 rounded"
          style={{ ["--tinta" as string]: 210 }}
        />
        assente: il turno resta visibile ma non conta
      </span>
      <span>◂ ▸ il turno continua nel giorno prima o dopo</span>
      {capo ? (
        <span className="flex items-center gap-1.5">
          <span
            className="barra h-3 w-6 rounded ring-2 ring-danger"
            style={{ ["--tinta" as string]: 210 }}
          />
          rifiutato: leggi i messaggi nei Turni
        </span>
      ) : null}
      {capo ? (
        <span>
          in Modifica le barre si trascinano: i bordi cambiano l&apos;orario, il
          centro sposta il turno — anche di reparto, dove la persona ci sa
          lavorare
        </span>
      ) : null}
    </div>
  );
}

function Vuoto({ capo, onApri }: { capo: boolean; onApri: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-surface-3 text-muted">
        <Users className="size-5" />
      </div>
      <div>
        <p className="text-[15px] font-medium">Nessun reparto</p>
        <p className="mt-1 text-[13.5px] text-muted">
          {capo
            ? "Crea i reparti e di' quante persone servono in ogni fascia: da lì in poi questa pagina dice da sola se la giornata è coperta."
            : "Il responsabile non ha ancora impostato i reparti."}
        </p>
      </div>
      {capo ? (
        <Button size="sm" onClick={onApri}>
          <Settings2 className="size-4" />
          Imposta i reparti
        </Button>
      ) : null}
    </div>
  );
}

/** Il box con cui si scelgono i reparti da vedere. La scelta resta nel
 *  browser di chi la fa: e' un modo di guardare, non un dato di tutti. */
function FiltroReparti({
  gruppi,
  nascosti,
  onCommuta,
}: {
  gruppi: { id: string; nome: string; tinta: number }[];
  nascosti: ReadonlySet<string>;
  onCommuta: (id: string) => void;
}) {
  const spenti = gruppi.filter((g) => nascosti.has(g.id)).length;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm">
          <ListFilter className="size-3.5" />
          <span className="hidden sm:inline">Mostra</span>
          {spenti > 0 ? (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">
              {gruppi.length - spenti}/{gruppi.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-float data-[state=open]:animate-pop"
        >
          <p className="px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-wide text-faint">
            Reparti da vedere
          </p>
          {gruppi.map((g) => (
            <DropdownMenu.CheckboxItem
              key={g.id}
              checked={!nascosti.has(g.id)}
              // Senza il preventDefault il box si chiuderebbe a ogni spunta,
              // e per spegnerne tre andrebbe riaperto tre volte.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onCommuta(g.id)}
              className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-3"
            >
              <span className="grid size-4 shrink-0 place-items-center rounded border border-border-strong bg-surface-2">
                <DropdownMenu.ItemIndicator>
                  <Check className="size-3 text-accent" />
                </DropdownMenu.ItemIndicator>
              </span>
              <span
                className="pastiglia-reparto truncate rounded-full px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide"
                style={{ ["--tinta" as string]: g.tinta }}
              >
                {g.nome}
              </span>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Settings2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { RepartiSheet } from "@/components/supervisione/reparti-sheet";
import {
  ShiftDialog,
  shiftToDraft,
  type ShiftDraft,
} from "@/components/turni/shift-dialog";
import { Button } from "@/components/ui/button";
import { dayLong, fromISODate, isToday, toISODate } from "@/lib/date";
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  intervalloVisibile,
  oraDa,
  segmentiDelGiorno,
  tintaDa,
  type Segmento,
} from "@/lib/supervisione/copertura";
import type { AbsenceDay, CoverageBand, Department, Profile, Shift } from "@/lib/types";
import { addDays } from "@/lib/week";
import { cn } from "@/lib/utils";

const SENZA_REPARTO = "__senza__";

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

  /** Il turno intero dietro una barra. La barra sa solo che ore occupa in
   *  questo giorno — di un 18:00-02:00 vede mezzo pezzo — mentre per
   *  modificarlo servono la data e gli orari veri, che sono quelli del
   *  turno da cui il pezzo e' stato ritagliato. */
  const perId = React.useMemo(() => new Map(turni.map((t) => [t.id, t])), [turni]);

  const apri = (turnoId: string) => {
    const turno = perId.get(turnoId);
    if (turno) setDaModificare(shiftToDraft(turno));
  };

  const vai = (g: string) =>
    startNavigazione(() => router.push(`/supervisione?g=${g}`, { scroll: false }));

  const dati = React.useMemo(() => {
    const segmenti = segmentiDelGiorno(turni, persone, giorno, giornoPrima, assenze);
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
      const mieiTurni = turni
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
            tinta: s.profileId ? tintaDa(s.profileId) : 40,
            segmenti: [s],
          });
      }

      const righe = [...perRiga.values()].sort(
        (a, b) => a.segmenti[0].da - b.segmenti[0].da || a.nome.localeCompare(b.nome),
      );

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
  }, [turni, persone, fasce, reparti, assenze, giorno, giornoPrima, mioId, capo]);

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
          <div className="flex items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Giorno precedente"
              onClick={() => vai(addDays(giorno, -1))}
              className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Giorno successivo"
              onClick={() => vai(addDays(giorno, 1))}
              className="tap grid h-9 w-9 place-items-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
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

        <div className="flex items-center gap-2">
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
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
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
                  <Stato buchi={g.buchi.length} conRegole={g.fasce.length > 0} />
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
                          {riga.segmenti.map((s) => (
                            <button
                              key={s.turnoId}
                              type="button"
                              // Il dipendente la barra la guarda e basta: senza
                              // il bottone niente cursore, niente fuoco da
                              // tastiera, niente da premere per sbaglio.
                              disabled={!capo}
                              onClick={() => apri(s.turnoId)}
                              className={cn(
                                "barra absolute inset-y-0 flex items-center overflow-hidden rounded-md px-2 text-left",
                                !s.profileId && "border-dashed",
                                s.assenza && "assente",
                                capo && "tap cursor-pointer",
                              )}
                              style={{
                                ["--tinta" as string]: riga.tinta,
                                left: `${pct(s.da)}%`,
                                width: `${pct(s.a) - pct(s.da)}%`,
                              }}
                              title={`${riga.nome} · ${oraDa(s.da)}–${oraDa(s.a)}${s.title ? ` · ${s.title}` : ""}${s.assenza ? " · assente, non conta" : ""}${capo ? " · tocca per modificare" : ""}`}
                            >
                              <span className="truncate text-[12px] font-semibold uppercase tracking-wide">
                                {s.daPrima ? "◂ " : ""}
                                {riga.nome}
                                {s.finoADopo ? " ▸" : ""}
                              </span>
                              <span className="orario ml-1.5 shrink-0 truncate text-[11px] tabular-nums opacity-70">
                                {s.assenza ? "assente" : `${oraDa(s.da)}–${oraDa(s.a)}`}
                              </span>
                            </button>
                          ))}
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

              {capo && g.buchi.length > 0 ? (
                <ul className="space-y-1 border-t border-border bg-danger-soft px-4 py-3">
                  {g.buchi.map((b) => (
                    <li
                      key={b.da}
                      className="flex items-center gap-2 text-[13px] text-danger"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" />
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
              ) : null}
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

function Stato({ buchi, conRegole }: { buchi: number; conRegole: boolean }) {
  if (!conRegole) {
    return (
      <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[12px] text-muted">
        Nessuna regola di copertura
      </span>
    );
  }
  if (buchi === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-medium text-success">
        <CheckCircle2 className="size-3.5" />
        Coperto
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[12px] font-medium text-danger">
      <AlertTriangle className="size-3.5" />
      {buchi} {buchi === 1 ? "buco" : "buchi"}
    </span>
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

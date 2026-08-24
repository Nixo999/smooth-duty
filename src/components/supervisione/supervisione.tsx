"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { RepartiSheet } from "@/components/supervisione/reparti-sheet";
import { Button } from "@/components/ui/button";
import { ETICHETTA } from "@/lib/assenze";
import { dayLong, formatDuration, fromISODate, toISODate } from "@/lib/date";
import { oraDa, tintaDa, type Segmento } from "@/lib/supervisione/copertura";
import type {
  BucoEtichettato,
  PersonaGiorno,
  PersonaPeriodo,
  Vista,
  VistaGiorno,
  VistaPeriodo,
} from "@/lib/supervisione/vista";
import type { CoverageBand, Department } from "@/lib/types";
import { cn } from "@/lib/utils";

type Livello = "giorno" | "mese" | "anno";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function sposta(livello: Livello, dentro: string, passo: number): string {
  const d = new Date(`${dentro}T12:00:00`);
  if (livello === "giorno") d.setDate(d.getDate() + passo);
  else if (livello === "mese") d.setMonth(d.getMonth() + passo, 1);
  else d.setFullYear(d.getFullYear() + passo, 0, 1);
  return toISODate(d);
}

export function Supervisione({
  livello,
  dentro,
  da,
  a,
  vista,
  reparti,
  fasce,
  capo,
}: {
  livello: Livello;
  dentro: string;
  da: string;
  a: string;
  vista: Vista;
  reparti: Department[];
  fasce: CoverageBand[];
  capo: boolean;
}) {
  const router = useRouter();
  const [impostazioni, setImpostazioni] = React.useState(false);
  const [inCorso, start] = React.useTransition();

  const vai = (v: Livello, d: string) =>
    start(() => router.push(`/supervisione?v=${v}&d=${d}`, { scroll: false }));

  const oggi = toISODate(new Date());
  const corrente = oggi >= da && oggi <= a;

  const titolo =
    livello === "giorno"
      ? dayLong(fromISODate(da))
      : livello === "mese"
        ? `${MESI[Number(da.slice(5, 7)) - 1]} ${da.slice(0, 4)}`
        : da.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Periodo precedente"
              onClick={() => vai(livello, sposta(livello, dentro, -1))}
              className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Periodo successivo"
              onClick={() => vai(livello, sposta(livello, dentro, 1))}
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
            {titolo}
          </p>

          {!corrente ? (
            <Button variant="ghost" size="sm" onClick={() => vai(livello, oggi)}>
              Oggi
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Livello"
            className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
          >
            {(["giorno", "mese", "anno"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={livello === v}
                onClick={() => vai(v, dentro)}
                className={cn(
                  "tap h-7 rounded-full px-3 text-[13px] font-medium capitalize",
                  livello === v
                    ? "bg-surface text-text shadow-soft"
                    : "text-muted hover:text-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {capo ? (
            <Button variant="secondary" size="sm" onClick={() => setImpostazioni(true)}>
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">Reparti e coperture</span>
            </Button>
          ) : null}
        </div>
      </div>

      {reparti.length === 0 ? (
        <Vuoto capo={capo} onApri={() => setImpostazioni(true)} />
      ) : vista.tipo === "giorno" ? (
        <GiornataIntera vista={vista} />
      ) : (
        <PeriodoIntero vista={vista} />
      )}

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

/* =================================================================== giorno */

function GiornataIntera({ vista }: { vista: VistaGiorno }) {
  const { finestra } = vista;
  const ore = (finestra.a - finestra.da) / 60;
  const larghezza = Math.max(520, ore * 58);
  const pct = (m: number) => ((m - finestra.da) / (finestra.a - finestra.da)) * 100;

  const oreIntere: number[] = [];
  for (let m = Math.ceil(finestra.da / 60) * 60; m <= finestra.a; m += 60) {
    oreIntere.push(m);
  }

  const inTurno = vista.persone.filter((p) => p.segmenti.length > 0);
  const riposo = vista.persone.filter((p) => p.segmenti.length === 0);

  return (
    <div className="space-y-4">
      <Mancanze
        minuti={vista.minutiScoperti}
        righe={vista.buchi}
        daAssegnare={vista.daAssegnare}
      />

      {inTurno.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
          Nessuno in turno in questo giorno.
        </p>
      ) : (
        <div className="stagger space-y-2.5">
          {inTurno.map((p) => (
            <SchedaPersona
              key={p.id}
              persona={p}
              pct={pct}
              ore={oreIntere}
              larghezza={larghezza}
            />
          ))}
        </div>
      )}

      {riposo.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft">
          <p className="text-[12px] uppercase tracking-wide text-faint">
            A riposo oggi
          </p>
          <p className="mt-1 text-[13.5px] text-muted">
            {riposo.map((p) => p.nome).join(" · ")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SchedaPersona({
  persona,
  pct,
  ore,
  larghezza,
}: {
  persona: PersonaGiorno;
  pct: (m: number) => number;
  ore: number[];
  larghezza: number;
}) {
  const tinta = tintaDa(persona.id);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-card",
        persona.assenza ? "border-warning/40" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
        <p className="text-[14.5px] font-semibold tracking-tight">{persona.nome}</p>
        {persona.reparto ? (
          <span
            className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ ["--tinta" as string]: persona.tinta }}
          >
            {persona.reparto}
          </span>
        ) : null}
        {persona.assenza ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
            {persona.assenza} — non conta
          </span>
        ) : null}
        <span className="ml-auto text-[13px] font-semibold tabular-nums text-muted">
          {persona.assenza ? "0h" : formatDuration(persona.minuti)}
        </span>
      </header>

      <div className="overflow-x-auto">
        <div style={{ minWidth: larghezza }} className="px-4 pb-3.5 pt-2">
          {/* Le ore sopra la barra: ogni scheda ha la sua riga perché
              scorrendo un elenco lungo, un asse solo in cima si perde. */}
          <div className="relative mb-1 h-3.5">
            {ore.map((m) => (
              <span
                key={m}
                className="absolute -translate-x-1/2 text-[10.5px] tabular-nums text-faint"
                style={{ left: `${pct(m)}%` }}
              >
                {oraDa(m).slice(0, 2)}
              </span>
            ))}
          </div>

          <div className="relative h-9">
            {ore.map((m) => (
              <span
                key={m}
                aria-hidden
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${pct(m)}%` }}
              />
            ))}

            {persona.segmenti.map((s) => (
              <span
                key={s.turnoId}
                className={cn(
                  "barra absolute inset-y-0 flex items-center overflow-hidden rounded-lg px-2.5",
                  persona.assenza && "assente",
                )}
                style={{
                  ["--tinta" as string]: tinta,
                  left: `${pct(s.da)}%`,
                  width: `${pct(s.a) - pct(s.da)}%`,
                }}
                title={`${oraDa(s.da)}–${oraDa(s.a)}${s.title ? ` · ${s.title}` : ""}`}
              >
                <span className="orario truncate text-[12.5px] font-semibold tabular-nums">
                  {s.daPrima ? "◂ " : ""}
                  {oraDa(s.da)}–{oraDa(s.a)}
                  {s.finoADopo ? " ▸" : ""}
                </span>
                {s.title ? (
                  <span className="ml-2 truncate text-[11.5px] opacity-75">
                    {s.title}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ mese e anno */

function PeriodoIntero({ vista }: { vista: VistaPeriodo }) {
  const massimo = Math.max(1, ...vista.persone.flatMap((p) => p.valori));

  return (
    <div className="space-y-4">
      <MancanzePeriodo vista={vista} />

      {vista.persone.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
          Nessuno in squadra.
        </p>
      ) : (
        <div className="stagger space-y-2.5">
          {vista.persone.map((p) => (
            <SchedaPeriodo key={p.id} persona={p} vista={vista} massimo={massimo} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Etichette sotto le colonne: nel mese una ogni cinque giorni, altrimenti
 *  diventano una riga illeggibile di numeri appiccicati. */
function mostraEtichetta(vista: VistaPeriodo, i: number) {
  return vista.tipo === "anno" || i === 0 || (i + 1) % 5 === 0;
}

function SchedaPeriodo({
  persona,
  vista,
  massimo,
}: {
  persona: PersonaPeriodo;
  vista: VistaPeriodo;
  massimo: number;
}) {
  const differenza =
    persona.attesi === null ? null : persona.minuti - persona.attesi;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
        <p className="text-[14.5px] font-semibold tracking-tight">{persona.nome}</p>
        {persona.reparto ? (
          <span
            className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ ["--tinta" as string]: persona.tinta }}
          >
            {persona.reparto}
          </span>
        ) : null}
        <span className="ml-auto text-[13px] font-semibold tabular-nums">
          {formatDuration(persona.minuti)}
          {persona.attesi !== null ? (
            <span className="font-normal text-muted">
              {" "}
              di {formatDuration(Math.round(persona.attesi))}
            </span>
          ) : null}
        </span>
      </header>

      <div className="px-4 pb-2 pt-3">
        <div
          className="flex h-12 items-end gap-px"
          role="img"
          aria-label={`Ore lavorate per ${vista.tipo === "mese" ? "giorno" : "mese"}`}
        >
          {persona.valori.map((v, i) => (
            <span
              key={vista.colonne[i].chiave}
              className={cn(
                "min-w-[3px] flex-1 rounded-sm",
                v > 0 ? "bg-accent" : "bg-surface-3",
              )}
              style={{ height: v > 0 ? `${Math.max(8, (v / massimo) * 100)}%` : "3px" }}
              title={`${vista.colonne[i].etichetta}: ${v > 0 ? formatDuration(v) : "niente"}`}
            />
          ))}
        </div>

        <div className="mt-1 flex gap-px">
          {vista.colonne.map((c, i) => (
            <span
              key={c.chiave}
              className="min-w-[3px] flex-1 text-center text-[9.5px] tabular-nums text-faint"
            >
              {mostraEtichetta(vista, i) ? c.corta : ""}
            </span>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px]">
        {differenza !== null ? (
          <span
            className={cn(
              "tabular-nums",
              Math.abs(differenza) < 60
                ? "text-success"
                : differenza > 0
                  ? "text-warning"
                  : "text-muted",
            )}
          >
            {differenza >= 0 ? "+" : "−"}
            {formatDuration(Math.abs(Math.round(differenza)))} sul contratto
          </span>
        ) : (
          <span className="text-muted">a chiamata</span>
        )}

        {persona.turniSaltati > 0 ? (
          <span className="text-warning">
            {persona.turniSaltati}{" "}
            {persona.turniSaltati === 1 ? "turno saltato" : "turni saltati"} ·{" "}
            {formatDuration(persona.minutiPersi)}
          </span>
        ) : null}

        {persona.assenze.map((c) => (
          <span key={c.causale} className="text-muted">
            {ETICHETTA(c.causale)} · {c.giorni}
            {c.giorni === 1 ? " giorno" : " giorni"}
          </span>
        ))}
      </footer>
    </section>
  );
}

/* ================================================================ mancanze */

function Mancanze({
  minuti,
  righe,
  daAssegnare,
}: {
  minuti: number;
  righe: BucoEtichettato[];
  daAssegnare: Segmento[];
}) {
  const nulla = righe.length === 0 && daAssegnare.length === 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3",
          nulla ? "bg-success-soft" : "bg-danger-soft",
        )}
      >
        {nulla ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-danger" />
        )}
        <p
          className={cn(
            "text-[14px] font-semibold",
            nulla ? "text-success" : "text-danger",
          )}
        >
          {nulla ? "Tutto coperto" : `${formatDuration(minuti)} scoperte`}
        </p>
        {!nulla ? (
          <span className="text-[12.5px] text-danger/80">
            {righe.length} {righe.length === 1 ? "mancanza" : "mancanze"}
            {daAssegnare.length > 0
              ? ` · ${daAssegnare.length} da assegnare`
              : ""}
          </span>
        ) : null}
      </header>

      {!nulla ? (
        <ul className="divide-y divide-border">
          {righe.map((b, i) => (
            <li
              key={`${b.reparto}-${b.da}-${i}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]"
            >
              <span className="font-semibold tabular-nums">
                {oraDa(b.da)}–{oraDa(b.a)}
              </span>
              <span
                className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                style={{ ["--tinta" as string]: b.tinta }}
              >
                {b.reparto}
              </span>
              <span className="text-muted">
                servono {b.richiesti},{" "}
                {b.presenti === 0
                  ? "non c'è nessuno"
                  : b.presenti === 1
                    ? "c'è una persona"
                    : `ce ne sono ${b.presenti}`}
              </span>
            </li>
          ))}

          {daAssegnare.map((s) => (
            <li
              key={s.turnoId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]"
            >
              <span className="font-semibold tabular-nums">
                {oraDa(s.da)}–{oraDa(s.a)}
              </span>
              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                da assegnare
              </span>
              {s.title ? <span className="text-muted">{s.title}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MancanzePeriodo({ vista }: { vista: VistaPeriodo }) {
  const nulla = vista.minutiScoperti === 0;
  const massimo = Math.max(1, ...vista.scopertiPerColonna);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3",
          nulla ? "bg-success-soft" : "bg-danger-soft",
        )}
      >
        {nulla ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-danger" />
        )}
        <p
          className={cn(
            "text-[14px] font-semibold",
            nulla ? "text-success" : "text-danger",
          )}
        >
          {nulla
            ? "Nessuna mancanza nel periodo"
            : `${formatDuration(vista.minutiScoperti)} scoperte`}
        </p>
        <span
          className={cn(
            "text-[12.5px]",
            nulla ? "text-success/80" : "text-danger/80",
          )}
        >
          {nulla
            ? `su ${vista.giorni - vista.giorniSenzaTurni} giorni pianificati`
            : `in ${vista.giorniConBuchi} ${vista.giorniConBuchi === 1 ? "giorno" : "giorni"} su ${vista.giorni - vista.giorniSenzaTurni} pianificati`}
        </span>
        {vista.giorniSenzaTurni > 0 ? (
          <span className="ml-auto text-[12.5px] text-muted">
            {vista.giorniSenzaTurni}{" "}
            {vista.giorniSenzaTurni === 1 ? "giorno" : "giorni"} senza turni —
            tabellone non ancora fatto
          </span>
        ) : null}
      </header>

      {!nulla ? (
        <div className="px-4 pb-3 pt-3.5">
          <div className="flex h-10 items-end gap-px">
            {vista.scopertiPerColonna.map((v, i) => (
              <span
                key={vista.colonne[i].chiave}
                className={cn(
                  "min-w-[3px] flex-1 rounded-sm",
                  v > 0 ? "bg-danger" : "bg-surface-3",
                )}
                style={{
                  height: v > 0 ? `${Math.max(10, (v / massimo) * 100)}%` : "3px",
                }}
                title={`${vista.colonne[i].etichetta}: ${v > 0 ? `${formatDuration(v)} scoperte` : "tutto coperto"}`}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-px">
            {vista.colonne.map((c, i) => (
              <span
                key={c.chiave}
                className="min-w-[3px] flex-1 text-center text-[9.5px] tabular-nums text-faint"
              >
                {mostraEtichetta(vista, i) ? c.corta : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
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
            ? "I reparti servono a sapere quante persone servono in ogni fascia: senza, questa pagina non può dire se manca qualcuno."
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

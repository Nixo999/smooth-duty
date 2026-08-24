"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ETICHETTA } from "@/lib/assenze";
import { dayLong, formatDuration, fromISODate, toISODate, weekLabel } from "@/lib/date";
import { oraDa } from "@/lib/supervisione/copertura";
import type { Livello, Prospetto as Dati, RigaProspetto } from "@/lib/prospetto";
import { cn } from "@/lib/utils";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function sposta(livello: Livello, dentro: string, passo: number): string {
  const d = new Date(`${dentro}T12:00:00`);
  if (livello === "settimana") d.setDate(d.getDate() + passo * 7);
  else if (livello === "mese") d.setMonth(d.getMonth() + passo, 1);
  else d.setFullYear(d.getFullYear() + passo, 0, 1);
  return toISODate(d);
}

export function Prospetto({
  dentro,
  da,
  a,
  dati,
}: {
  dentro: string;
  da: string;
  a: string;
  dati: Dati;
}) {
  const router = useRouter();
  const [inCorso, start] = React.useTransition();
  const { livello } = dati;

  const vai = (v: Livello, d: string) =>
    start(() => router.push(`/prospetto?v=${v}&d=${d}`, { scroll: false }));

  const oggi = toISODate(new Date());
  const corrente = oggi >= da && oggi <= a;

  const titolo =
    livello === "settimana"
      ? weekLabel(fromISODate(da))
      : livello === "mese"
        ? `${MESI[Number(da.slice(5, 7)) - 1]} ${da.slice(0, 4)}`
        : da.slice(0, 4);

  const massimo = Math.max(1, ...dati.righe.flatMap((r) => r.valori));

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

          <div className="min-w-0">
            <p
              className="text-[15px] font-semibold capitalize tracking-tight"
              aria-live="polite"
              data-pending={inCorso || undefined}
            >
              {titolo}
            </p>
            <p className="text-[12px] text-faint">
              {dati.giorni} giorni
              {dati.giorniSenzaTurni > 0
                ? ` · ${dati.giorni - dati.giorniSenzaTurni} con turni`
                : ""}
            </p>
          </div>

          {!corrente ? (
            <Button variant="ghost" size="sm" onClick={() => vai(livello, oggi)}>
              Oggi
            </Button>
          ) : null}
        </div>

        <div
          role="radiogroup"
          aria-label="Periodo"
          className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
        >
          {(["settimana", "mese", "anno"] as const).map((v) => (
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
      </div>

      <Mancanze dati={dati} />

      {dati.righe.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
          Nessuno in squadra.
        </p>
      ) : (
        <div className="stagger space-y-2.5">
          {dati.righe.map((r) => (
            <SchedaPersona key={r.id} riga={r} dati={dati} massimo={massimo} />
          ))}
        </div>
      )}

      <p className="px-1 text-[12px] text-faint">
        Le ore attese vengono dal contratto settimanale, riproporzionato sui{" "}
        {dati.giorni} giorni del periodo. Su una settimana il conto è esatto; su
        un mese o un anno è un&apos;attesa, non un obbligo contrattuale.
      </p>
    </div>
  );
}

/* ================================================================ mancanze */

function Mancanze({ dati }: { dati: Dati }) {
  const nulla =
    dati.minutiScoperti === 0 &&
    dati.turniDaAssegnare === 0 &&
    dati.minutiPersi === 0;

  const massimo = Math.max(1, ...dati.scopertiPerColonna);
  const pianificati = dati.giorni - dati.giorniSenzaTurni;

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
          {nulla ? "Niente da coprire" : "Mancanze del periodo"}
        </p>
        <span
          className={cn(
            "text-[12.5px]",
            nulla ? "text-success/80" : "text-danger/80",
          )}
        >
          su {pianificati} {pianificati === 1 ? "giorno" : "giorni"} con turni
        </span>
        {dati.giorniSenzaTurni > 0 ? (
          <span className="ml-auto text-[12.5px] text-muted">
            {dati.giorniSenzaTurni}{" "}
            {dati.giorniSenzaTurni === 1 ? "giorno" : "giorni"} senza turni —
            tabellone non ancora fatto
          </span>
        ) : null}
      </header>

      <div className="grid gap-px bg-border sm:grid-cols-3">
        <Dato
          etichetta="Scoperte"
          valore={formatDuration(dati.minutiScoperti)}
          nota={
            dati.giorniConMancanze > 0
              ? `in ${dati.giorniConMancanze} ${dati.giorniConMancanze === 1 ? "giorno" : "giorni"}`
              : "tutte le fasce coperte"
          }
          allerta={dati.minutiScoperti > 0}
        />
        <Dato
          etichetta="Da assegnare"
          valore={formatDuration(dati.minutiDaAssegnare)}
          nota={
            dati.turniDaAssegnare > 0
              ? `${dati.turniDaAssegnare} ${dati.turniDaAssegnare === 1 ? "turno" : "turni"} senza nessuno`
              : "nessun turno orfano"
          }
          allerta={dati.turniDaAssegnare > 0}
        />
        <Dato
          etichetta="Perse per assenza"
          valore={formatDuration(dati.minutiPersi)}
          nota={
            dati.minutiPersi > 0 ? "turni saltati, da coprire" : "nessuna assenza"
          }
          allerta={dati.minutiPersi > 0}
        />
      </div>

      {dati.minutiScoperti > 0 ? (
        <div className="px-4 pb-3 pt-3.5">
          <div className="flex h-10 items-end gap-px">
            {dati.scopertiPerColonna.map((v, i) => (
              <span
                key={dati.colonne[i].chiave}
                className={cn(
                  "min-w-[3px] flex-1 rounded-sm",
                  v > 0 ? "bg-danger" : "bg-surface-3",
                )}
                style={{
                  height: v > 0 ? `${Math.max(10, (v / massimo) * 100)}%` : "3px",
                }}
                title={`${dati.colonne[i].etichetta}: ${v > 0 ? `${formatDuration(v)} scoperte` : "tutto coperto"}`}
              />
            ))}
          </div>
          <Etichette dati={dati} />

          <ul className="mt-3 space-y-1 border-t border-border pt-2.5">
            {dati.mancanze.slice(0, 8).map((m, i) => (
              <li
                key={`${m.giorno}-${m.reparto}-${m.da}-${i}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]"
              >
                <span className="text-muted">
                  {dayLong(fromISODate(m.giorno))}
                </span>
                <span className="font-semibold tabular-nums">
                  {oraDa(m.da)}–{oraDa(m.a)}
                </span>
                <span
                  className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                  style={{ ["--tinta" as string]: m.tinta }}
                >
                  {m.reparto}
                </span>
                <span className="text-muted">
                  servono {m.richiesti},{" "}
                  {m.presenti === 0
                    ? "non c'è nessuno"
                    : m.presenti === 1
                      ? "c'è una persona"
                      : `ce ne sono ${m.presenti}`}
                </span>
              </li>
            ))}
            {dati.mancanze.length > 8 ? (
              <li className="text-[12.5px] text-faint">
                …e altre {dati.mancanze.length - 8}.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Dato({
  etichetta,
  valore,
  nota,
  allerta,
}: {
  etichetta: string;
  valore: string;
  nota: string;
  allerta?: boolean;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">{etichetta}</p>
      <p
        className={cn(
          "mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight",
          allerta ? "text-warning" : "text-muted",
        )}
      >
        {valore}
      </p>
      <p className="text-[12px] text-muted">{nota}</p>
    </div>
  );
}

/* ========================================================= scheda persona */

/** Etichette sotto le colonne: sul mese una ogni cinque giorni, altrimenti
 *  diventano una riga illeggibile di numeri appiccicati. */
function Etichette({ dati }: { dati: Dati }) {
  const mostra = (i: number) =>
    dati.livello !== "mese" || i === 0 || (i + 1) % 5 === 0;

  return (
    <div className="mt-1 flex gap-px">
      {dati.colonne.map((c, i) => (
        <span
          key={c.chiave}
          className="min-w-[3px] flex-1 text-center text-[9.5px] tabular-nums text-faint"
        >
          {mostra(i) ? c.corta : ""}
        </span>
      ))}
    </div>
  );
}

function SchedaPersona({
  riga,
  dati,
  massimo,
}: {
  riga: RigaProspetto;
  dati: Dati;
  massimo: number;
}) {
  const differenza = riga.attesi === null ? null : riga.minuti - riga.attesi;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5">
        <p className="text-[15px] font-semibold tracking-tight">{riga.nome}</p>
        {riga.reparto ? (
          <span
            className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
            style={{ ["--tinta" as string]: riga.tinta }}
          >
            {riga.reparto}
          </span>
        ) : null}
        <span className="ml-auto text-[15px] font-semibold tabular-nums">
          {formatDuration(riga.minuti)}
          {riga.attesi !== null ? (
            <span className="text-[13px] font-normal text-muted">
              {" "}
              di {formatDuration(Math.round(riga.attesi))}
            </span>
          ) : null}
        </span>
      </header>

      <div className="px-4 pb-2 pt-3">
        <div
          className="flex h-14 items-end gap-px"
          role="img"
          aria-label={`Ore lavorate per ${dati.livello === "anno" ? "mese" : "giorno"}`}
        >
          {riga.valori.map((v, i) => (
            <span
              key={dati.colonne[i].chiave}
              className={cn(
                "min-w-[3px] flex-1 rounded-sm",
                v > 0 ? "bg-accent" : "bg-surface-3",
              )}
              style={{ height: v > 0 ? `${Math.max(8, (v / massimo) * 100)}%` : "3px" }}
              title={`${dati.colonne[i].etichetta}: ${v > 0 ? formatDuration(v) : "niente"}`}
            />
          ))}
        </div>
        <Etichette dati={dati} />
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px]">
        {differenza !== null ? (
          <span
            className={cn(
              "font-medium tabular-nums",
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
          <span className="text-muted">
            {riga.aChiamata ? "a chiamata" : "nessun contratto indicato"}
          </span>
        )}

        {riga.turniSaltati > 0 ? (
          <span className="text-warning">
            {riga.turniSaltati}{" "}
            {riga.turniSaltati === 1 ? "turno saltato" : "turni saltati"} ·{" "}
            {formatDuration(riga.minutiPersi)} perse
          </span>
        ) : null}

        {riga.assenze.map((c) => (
          <span key={c.causale} className="text-muted">
            {ETICHETTA(c.causale)} · {c.giorni}
            {c.giorni === 1 ? " giorno" : " giorni"}
          </span>
        ))}
      </footer>
    </section>
  );
}

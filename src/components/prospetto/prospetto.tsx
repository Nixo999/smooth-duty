"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ETICHETTA } from "@/lib/assenze";
import { dayLong, formatDuration, fromISODate, toISODate, weekLabel } from "@/lib/date";
import type { Livello, Prospetto as Dati, Totali } from "@/lib/prospetto";
import { cn } from "@/lib/utils";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function spostaPeriodo(livello: Livello, dentro: string, passo: number): string {
  const d = new Date(`${dentro}T12:00:00`);
  if (livello === "settimana") d.setDate(d.getDate() + passo * 7);
  else if (livello === "mese") d.setMonth(d.getMonth() + passo, 1);
  else d.setFullYear(d.getFullYear() + passo, 0, 1);
  return toISODate(d);
}

/** Ore scritte corte: in una tabella di venti colonne «—» si legge meglio di
 *  «0h», perché lo zero vero e il niente sono la stessa cosa e vanno via
 *  dall'occhio. */
const ore = (m: number) => (m > 0 ? formatDuration(m) : "—");

export function Prospetto({
  livello,
  dentro,
  da,
  a,
  dati,
}: {
  livello: Livello;
  dentro: string;
  da: string;
  a: string;
  dati: Dati;
}) {
  const router = useRouter();
  const [inCorso, start] = React.useTransition();

  const vai = (p: Livello, d: string) =>
    start(() => router.push(`/prospetto?p=${p}&d=${d}`, { scroll: false }));

  const titolo =
    livello === "settimana"
      ? weekLabel(fromISODate(da))
      : livello === "mese"
        ? `${MESI[Number(da.slice(5, 7)) - 1]} ${da.slice(0, 4)}`
        : da.slice(0, 4);

  const oggi = toISODate(new Date());
  const corrente = oggi >= da && oggi <= a;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Periodo precedente"
              onClick={() => vai(livello, spostaPeriodo(livello, dentro, -1))}
              className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Periodo successivo"
              onClick={() => vai(livello, spostaPeriodo(livello, dentro, 1))}
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
              {dayLong(fromISODate(da))} → {dayLong(fromISODate(a))} · {dati.giorni}{" "}
              giorni
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

      <Riepilogo totali={dati.totale} scoperti={dati.scopertiMinuti} />

      <Tabella dati={dati} />

      <p className="px-1 text-[12px] text-faint">
        Le ore di assenza sono le ore di turno che quel giorno sarebbero state
        lavorate: chi è assente in un giorno di riposo non perde ore. Le ore
        attese vengono dal contratto settimanale, riproporzionato sui{" "}
        {dati.giorni} giorni del periodo.
      </p>
    </div>
  );
}

function Riepilogo({ totali, scoperti }: { totali: Totali; scoperti: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Dato
        etichetta="Ore effettive"
        valore={formatDuration(totali.effettivi)}
        nota="quelle che verranno lavorate"
        forte
      />
      <Dato
        etichetta="Ore attese"
        valore={totali.attesi === null ? "—" : formatDuration(Math.round(totali.attesi))}
        nota="somma dei contratti nel periodo"
      />
      <Dato
        etichetta="Perse per assenza"
        valore={formatDuration(totali.persi)}
        nota="turni saltati, da coprire"
        allerta={totali.persi > 0}
      />
      <Dato
        etichetta="Turni scoperti"
        valore={formatDuration(scoperti)}
        nota="non assegnati a nessuno"
        allerta={scoperti > 0}
      />
    </div>
  );
}

function Dato({
  etichetta,
  valore,
  nota,
  forte,
  allerta,
}: {
  etichetta: string;
  valore: string;
  nota: string;
  forte?: boolean;
  allerta?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="text-[11px] uppercase tracking-wide text-faint">{etichetta}</p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight",
          allerta && "text-warning",
          forte && "text-accent",
        )}
      >
        {valore}
      </p>
      <p className="text-[12px] text-muted">{nota}</p>
    </div>
  );
}

/* ================================================================ tabella */

function Tabella({ dati }: { dati: Dati }) {
  if (dati.righe.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
        Nessuno in squadra.
      </p>
    );
  }

  // Una colonna per causale, più il nome e il totale: sotto ai 700px la
  // tabella scorre di lato invece di schiacciarsi illeggibile.
  const larghezza = 22 + 8 + dati.causali.length * 7;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: `${larghezza}rem` }}
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 font-medium">
                Nome
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Assenze</th>
              {dati.causali.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2.5 text-right font-medium"
                  title={`Ore di assenza per ${ETICHETTA(c).toLowerCase()}`}
                >
                  {ETICHETTA(c)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {dati.righe.map((r) => {
              const totaleRiga = Object.values(r.perCausale).reduce(
                (n, m) => n + m,
                0,
              );

              return (
                <tr key={r.profileId} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{r.nome}</span>
                      {r.reparto ? (
                        <span
                          className="pastiglia-reparto rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide"
                          style={{ ["--tinta" as string]: r.tinta }}
                        >
                          {r.reparto}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11.5px] text-faint">
                      {formatDuration(r.totali.effettivi)} lavorate
                      {r.aChiamata
                        ? " · a chiamata"
                        : r.contratto !== null
                          ? ` di ${formatDuration(Math.round(r.totali.attesi ?? 0))}`
                          : ""}
                    </p>
                  </td>

                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-semibold tabular-nums",
                      totaleRiga > 0 ? "text-warning" : "text-faint",
                    )}
                    title={
                      r.giorniAssenza > 0
                        ? `${r.giorniAssenza} giorni di calendario, ${r.turniSaltati} turni saltati`
                        : undefined
                    }
                  >
                    {ore(totaleRiga)}
                  </td>

                  {dati.causali.map((c) => {
                    const minuti = r.perCausale[c] ?? 0;
                    const giorni = r.giorniPerCausale[c] ?? 0;
                    return (
                      <td
                        key={c}
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          minuti > 0 ? "text-text" : "text-faint",
                        )}
                        title={
                          giorni > 0
                            ? `${giorni} ${giorni === 1 ? "giorno" : "giorni"} di ${ETICHETTA(c).toLowerCase()}`
                            : undefined
                        }
                      >
                        {ore(minuti)}
                        {minuti === 0 && giorni > 0 ? (
                          <span className="block text-[10.5px] text-muted">
                            {giorni}g
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border-strong bg-surface-2 font-semibold">
              <td className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5">Totale</td>
              <td
                className={cn(
                  "px-3 py-2.5 text-right tabular-nums",
                  dati.totaleAssenze > 0 ? "text-warning" : "text-faint",
                )}
              >
                {ore(dati.totaleAssenze)}
              </td>
              {dati.causali.map((c) => (
                <td key={c} className="px-3 py-2.5 text-right tabular-nums">
                  {ore(dati.totalePerCausale[c] ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

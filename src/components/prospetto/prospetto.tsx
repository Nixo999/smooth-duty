"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ETICHETTA } from "@/lib/assenze";
import { dayLong, formatDuration, fromISODate, toISODate, weekLabel } from "@/lib/date";
import type { GruppoProspetto, Prospetto as Dati, Totali } from "@/lib/prospetto";
import { cn } from "@/lib/utils";

type Periodo = "settimana" | "mese";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function spostaPeriodo(periodo: Periodo, dentro: string, passo: number): string {
  const d = new Date(`${dentro}T12:00:00`);
  if (periodo === "settimana") d.setDate(d.getDate() + passo * 7);
  else d.setMonth(d.getMonth() + passo, 1);
  return toISODate(d);
}

export function Prospetto({
  periodo,
  dentro,
  da,
  a,
  dati,
}: {
  periodo: Periodo;
  dentro: string;
  da: string;
  a: string;
  dati: Dati;
}) {
  const router = useRouter();
  const [inCorso, start] = React.useTransition();

  const vai = (p: Periodo, d: string) =>
    start(() => router.push(`/prospetto?p=${p}&d=${d}`, { scroll: false }));

  const [anno, mese] = da.split("-").map(Number);
  const titolo =
    periodo === "settimana"
      ? weekLabel(fromISODate(da))
      : `${MESI[mese - 1]} ${anno}`;

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
              onClick={() => vai(periodo, spostaPeriodo(periodo, dentro, -1))}
              className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Periodo successivo"
              onClick={() => vai(periodo, spostaPeriodo(periodo, dentro, 1))}
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
            <Button variant="ghost" size="sm" onClick={() => vai(periodo, oggi)}>
              Oggi
            </Button>
          ) : null}
        </div>

        <div
          role="radiogroup"
          aria-label="Periodo"
          className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
        >
          {(["settimana", "mese"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={periodo === v}
              onClick={() => vai(v, dentro)}
              className={cn(
                "tap h-7 rounded-full px-3 text-[13px] font-medium capitalize",
                periodo === v
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

      <div className="stagger space-y-4">
        {dati.gruppi.map((g) => (
          <Reparto key={g.repartoId ?? "senza"} gruppo={g} />
        ))}
      </div>

      <p className="px-1 text-[12px] text-faint">
        Le ore attese vengono dal contratto settimanale, riproporzionato sui{" "}
        {dati.giorni} giorni del periodo. Su una settimana il conto è esatto; su
        un mese è un&apos;attesa, non un obbligo contrattuale.
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

function Reparto({ gruppo }: { gruppo: GruppoProspetto }) {
  if (gruppo.righe.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="pastiglia-reparto rounded-full px-2.5 py-1 text-[12.5px] font-semibold uppercase tracking-wide"
            style={{ ["--tinta" as string]: gruppo.tinta }}
          >
            {gruppo.nome}
          </span>
          <span className="text-[12.5px] text-muted">
            {gruppo.righe.length}{" "}
            {gruppo.righe.length === 1 ? "persona" : "persone"}
          </span>
        </div>
        <span className="text-[13px] font-semibold tabular-nums">
          {formatDuration(gruppo.totali.effettivi)}
          {gruppo.totali.attesi !== null ? (
            <span className="font-normal text-muted">
              {" "}
              di {formatDuration(Math.round(gruppo.totali.attesi))}
            </span>
          ) : null}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 text-right font-medium">Effettive</th>
              <th className="px-3 py-2 text-right font-medium">Attese</th>
              <th className="px-3 py-2 text-right font-medium">Differenza</th>
              <th className="px-3 py-2 text-right font-medium">Perse</th>
              <th className="px-4 py-2 font-medium">Assenze</th>
            </tr>
          </thead>
          <tbody>
            {gruppo.righe.map((r) => {
              const differenza =
                r.totali.attesi === null ? null : r.totali.effettivi - r.totali.attesi;

              return (
                <tr key={r.profileId} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.nome}</p>
                    <p className="text-[12px] text-faint">
                      {r.aChiamata
                        ? "a chiamata"
                        : r.contratto !== null
                          ? `${r.contratto}h a settimana`
                          : "nessun contratto indicato"}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatDuration(r.totali.effettivi)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {r.totali.attesi === null
                      ? "—"
                      : formatDuration(Math.round(r.totali.attesi))}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      differenza === null
                        ? "text-faint"
                        : differenza > 30
                          ? "text-warning"
                          : differenza < -30
                            ? "text-muted"
                            : "text-success",
                    )}
                  >
                    {differenza === null
                      ? "—"
                      : `${differenza >= 0 ? "+" : "−"}${formatDuration(Math.abs(Math.round(differenza)))}`}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      r.totali.persi > 0 ? "text-warning" : "text-faint",
                    )}
                  >
                    {r.totali.persi > 0 ? formatDuration(r.totali.persi) : "—"}
                    {r.turniSaltati > 0 ? (
                      <span className="block text-[11px]">
                        {r.turniSaltati} {r.turniSaltati === 1 ? "turno" : "turni"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.assenzePerCausale.length === 0 ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.assenzePerCausale.map((c) => (
                          <span
                            key={c.causale}
                            className="rounded-full bg-warning-soft px-2 py-0.5 text-[11.5px] text-warning"
                          >
                            {ETICHETTA(c.causale)} · {c.giorni}
                            {c.giorni === 1 ? " giorno" : " giorni"}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong bg-surface-2 font-semibold">
              <td className="px-4 py-2.5">Totale {gruppo.nome}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatDuration(gruppo.totali.effettivi)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                {gruppo.totali.attesi === null
                  ? "—"
                  : formatDuration(Math.round(gruppo.totali.attesi))}
              </td>
              <td />
              <td className="px-3 py-2.5 text-right tabular-nums text-warning">
                {gruppo.totali.persi > 0 ? formatDuration(gruppo.totali.persi) : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

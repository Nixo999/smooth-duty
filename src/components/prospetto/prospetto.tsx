"use client";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
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

/** Il periodo si legge prima come figura e poi come numero.
 *
 *  Rifatta il 2 settembre 2026. Quello che non andava non erano i conti — il
 *  motore in `lib/prospetto.ts` non l'ho toccato — era che la pagina apriva
 *  su **due numeri negativi senza denominatore**: «perse 96h» e «scoperti
 *  12h», e nessun modo di sapere se 96 ore su questo mese siano tante. Sopra
 *  la tabella adesso c'e' una figura sola — quanto del periodo e' stato
 *  lavorato e quanto e' andato perso — e i due numeri da coprire stanno
 *  accanto, che e' quello che sono: cose da fare, non misure del periodo.
 *
 *  **Due colori, e sono quelli che l'app usa gia'**: `--turno` per le ore
 *  lavorate (nell'app quel blu vuol dire «turno» da sempre) e `--warning` per
 *  quelle perse (e' il colore che questa tabella dava gia' alle assenze).
 *  Niente tavolozza nuova: qui il colore ha un significato solo, ed e' quella
 *  la regola.
 *
 *  Le barre non portano identita' da sole: ogni segmento ha la sua etichetta
 *  scritta accanto col valore, i due segmenti sono staccati di 2px, e i
 *  riquadri con un numero che allarma portano un'icona oltre al colore. Chi
 *  non distingue il blu dall'oro legge la stessa cosa. */
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
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:gap-5">
      {/* ------------------------------------------------------ testata --- */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ClipboardList className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-[19px] font-semibold leading-tight tracking-tight">
                Prospetto
              </h1>
              {/* Il periodo e' la cosa che cambia sotto le mani: sta in una
                  pastiglia accanto al titolo e si annuncia da sola. */}
              <span
                aria-live="polite"
                data-pending={inCorso || undefined}
                className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-medium capitalize text-muted"
              >
                {titolo}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {dayLong(fromISODate(da))} → {dayLong(fromISODate(a))} ·{" "}
              {dati.giorni} giorni
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Periodo precedente"
              onClick={() => vai(livello, spostaPeriodo(livello, dentro, -1))}
              className="tap grid h-full w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Periodo successivo"
              onClick={() => vai(livello, spostaPeriodo(livello, dentro, 1))}
              className="tap grid h-full w-9 place-items-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {!corrente ? (
            <Button variant="ghost" size="sm" onClick={() => vai(livello, oggi)}>
              Oggi
            </Button>
          ) : null}

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
      </div>

      <Sintesi totali={dati.totale} scoperti={dati.scopertiMinuti} />

      <Tabella dati={dati} />

      <details className="group rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card lg:px-5">
        <summary className="tap flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium">
          <Chevron />
          Come si contano le ore di assenza
        </summary>
        <p className="mt-2 pl-5 text-[13px] leading-relaxed text-muted">
          Si contano sul contratto, non sul tabellone: in una settimana da 40
          ore chi ne lavora 10 perché è stato in malattia ne perde 30, che il
          turno di quei giorni fosse scritto o no. Il conto è settimanale, come
          il contratto. Chi lavora a chiamata non ha un contratto da cui
          sottrarre: per lui restano le ore dei turni saltati.
        </p>
      </details>
    </div>
  );
}

/** La freccetta dei richiudibili, la stessa delle Impostazioni. */
function Chevron() {
  return (
    <span
      aria-hidden
      className="shrink-0 text-[13px] text-faint transition-transform group-open:rotate-90"
    >
      ›
    </span>
  );
}

/* ================================================================ sintesi */

/** La barra: due segmenti, staccati di 2px, con gli estremi arrotondati.
 *
 *  Non porta etichette dentro — le porta la legenda qui accanto, col valore
 *  scritto — perche' su una barra alta 8px un numero non ci sta e su una
 *  riga di tabella nemmeno. */
function Barra({
  lavorate,
  perse,
  alta,
  className,
}: {
  lavorate: number;
  perse: number;
  alta?: boolean;
  className?: string;
}) {
  const totale = lavorate + perse;
  const altezza = alta ? "h-2.5" : "h-1.5";

  if (totale <= 0) {
    return (
      <div
        aria-hidden
        className={cn("rounded-full bg-surface-3", altezza, className)}
      />
    );
  }

  const quota = (m: number) => `${(m / totale) * 100}%`;

  return (
    <div aria-hidden className={cn("flex gap-0.5", altezza, className)}>
      {lavorate > 0 ? (
        <span
          className="rounded-full bg-turno"
          style={{ width: quota(lavorate) }}
        />
      ) : null}
      {perse > 0 ? (
        <span
          className="rounded-full bg-warning"
          style={{ width: quota(perse) }}
        />
      ) : null}
    </div>
  );
}

function Voce({
  colore,
  etichetta,
  valore,
}: {
  colore: string;
  etichetta: string;
  valore: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colore)} />
      <span className="text-muted">{etichetta}</span>
      <span className="cifre font-medium text-text">{valore}</span>
    </span>
  );
}

function Sintesi({ totali, scoperti }: { totali: Totali; scoperti: number }) {
  const base = totali.effettivi + totali.persi;
  const quotaPersa = base > 0 ? Math.round((totali.persi / base) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      {/* Il numero grosso e' quello che si e' lavorato: e' il denominatore
          che mancava, e senza di lui «96 ore perse» non vuol dire niente. */}
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-card lg:col-span-2 lg:p-5">
        <p className="text-[12px] uppercase tracking-wide text-faint">
          Ore lavorate nel periodo
        </p>
        <p className="cifre mt-1 text-[34px] font-semibold leading-none tracking-tight">
          {totali.effettivi > 0 ? formatDuration(totali.effettivi) : "—"}
        </p>
        <p className="mt-1.5 text-[13px] text-muted">
          {base === 0
            ? "Nel periodo non risulta né lavoro né assenza."
            : totali.persi === 0
              ? "Nessuna ora persa: il periodo è pieno."
              : `Il ${quotaPersa}% delle ore è andato perso per assenze.`}
        </p>

        <Barra
          alta
          lavorate={totali.effettivi}
          perse={totali.persi}
          className="mt-4"
        />
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          <Voce
            colore="bg-turno"
            etichetta="Lavorate"
            valore={ore(totali.effettivi)}
          />
          <Voce
            colore="bg-warning"
            etichetta="Perse per assenza"
            valore={ore(totali.persi)}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-5">
        <Dato
          etichetta="Turni saltati"
          valore={ore(totali.saltati)}
          nota="già scritti, da ricoprire"
          allerta={totali.saltati > 0}
        />
        <Dato
          etichetta="Turni scoperti"
          valore={ore(scoperti)}
          nota="non assegnati a nessuno"
          allerta={scoperti > 0}
        />
      </div>
    </div>
  );
}

/** Un numero da coprire. L'icona non e' decorazione: e' il secondo segnale
 *  oltre al colore, per chi il giallo non lo vede diverso dal grigio. */
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
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] uppercase tracking-wide text-faint">
          {etichetta}
        </p>
        {allerta ? (
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warning" />
        ) : null}
      </div>
      <p
        className={cn(
          "cifre mt-0.5 text-[22px] font-semibold tracking-tight",
          allerta ? "text-warning" : "text-faint",
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
        <div className="grid size-11 place-items-center rounded-full bg-surface-3 text-muted">
          <Users className="size-5" />
        </div>
        <div>
          <p className="text-[15px] font-medium">Non c&apos;è ancora nessuno in squadra</p>
          <p className="mt-1 text-[13.5px] text-muted">
            Qui finiscono le ore lavorate e i giorni di assenza di ogni persona,
            periodo per periodo. Aggiungi le persone e i conti si riempiono da soli.
          </p>
        </div>
        <Link href="/squadra">
          <Button size="sm">
            <Plus className="size-4" />
            Aggiungi le persone
          </Button>
        </Link>
      </div>
    );
  }

  // Una colonna per causale, più il nome e il totale: sotto ai 700px la
  // tabella scorre di lato invece di schiacciarsi illeggibile.
  const larghezza = 22 + 8 + dati.causali.length * 7;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 lg:px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Users className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">Persona per persona</h2>
          <p className="text-[12.5px] text-muted">
            {dati.righe.length}{" "}
            {dati.righe.length === 1 ? "persona" : "persone"} · sotto ogni nome,
            quanto ha lavorato e quanto ha perso
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: `${larghezza}rem` }}
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[12px] uppercase tracking-wide text-faint">
              <th className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 font-medium lg:px-5">
                Nome
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                Assenze
              </th>
              {dati.causali.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-3 py-2.5 text-right font-medium"
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
                <tr key={r.profileId} className="group border-t border-border">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-3 group-hover:bg-surface-2 lg:px-5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{r.nome}</span>
                      {r.reparto ? (
                        <span
                          className="pastiglia-reparto rounded-full px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide"
                          style={{ ["--tinta" as string]: r.tinta }}
                        >
                          {r.reparto}
                        </span>
                      ) : null}
                    </div>
                    <Barra
                      lavorate={r.totali.effettivi}
                      perse={totaleRiga}
                      className="mt-1.5 max-w-[12rem]"
                    />
                    <p className="mt-1 text-[12px] text-faint">
                      {formatDuration(r.totali.effettivi)} lavorate
                      {totaleRiga > 0
                        ? ` · ${formatDuration(totaleRiga)} perse`
                        : ""}
                      {r.aChiamata ? " · a chiamata" : ""}
                    </p>
                  </td>

                  <td
                    className={cn(
                      "cifre px-3 py-3 text-right align-top font-semibold group-hover:bg-surface-2",
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
                          "cifre px-3 py-3 text-right align-top group-hover:bg-surface-2",
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
                          <span className="block text-[12px] text-muted">
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
              <td className="sticky left-0 z-10 bg-surface-2 px-4 py-2.5 lg:px-5">
                Totale
              </td>
              <td
                className={cn(
                  "cifre px-3 py-2.5 text-right",
                  dati.totaleAssenze > 0 ? "text-warning" : "text-faint",
                )}
              >
                {ore(dati.totaleAssenze)}
              </td>
              {dati.causali.map((c) => (
                <td key={c} className="cifre px-3 py-2.5 text-right">
                  {ore(dati.totalePerCausale[c] ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

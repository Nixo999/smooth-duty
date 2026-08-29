"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { analizzaFile, importaTurni } from "@/app/(app)/turni/importa/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { dayLong, formatDuration, fromISODate } from "@/lib/date";
import { matchPerson, type Candidate } from "@/lib/import/match";
import type { ParsedPerson, ParseResult } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const IGNORA = "";
const SCOPERTO = "__scoperto__";

function minutesOf(person: ParsedPerson) {
  return person.shifts.reduce((sum, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    let d = eh * 60 + em - (sh * 60 + sm);
    if (d <= 0) d += 1440;
    return sum + d;
  }, 0);
}

export function Importa({ people }: { people: Candidate[] }) {
  const router = useRouter();
  const [analyzing, startAnalysis] = React.useTransition();
  const [importing, startImport] = React.useTransition();

  const [result, setResult] = React.useState<ParseResult | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [mapping, setMapping] = React.useState<Record<number, string>>({});
  const [sostituisci, setSostituisci] = React.useState(true);
  const [dragging, setDragging] = React.useState(false);

  function analyze(file: File) {
    setFileName(file.name);
    startAnalysis(async () => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await analizzaFile(formData);
      if (!response.ok) {
        toast.error(response.error);
        setResult(null);
        return;
      }

      // Abbinamento automatico: quello che riesce da solo, riesce subito.
      // Il resto resta scoperto e lo decide chi guarda.
      const initial: Record<number, string> = {};
      for (const person of response.result.people) {
        initial[person.index] = matchPerson(person.fullName, people) ?? IGNORA;
      }
      setMapping(initial);
      setResult(response.result);
    });
  }

  function reset() {
    setResult(null);
    setFileName(null);
    setMapping({});
  }

  const shiftsToImport = React.useMemo(() => {
    if (!result) return [];
    return result.people.flatMap((person) => {
      const target = mapping[person.index];
      if (target === IGNORA) return [];
      return person.shifts.map((s) => ({
        profile_id: target === SCOPERTO ? null : target,
        date: s.date,
        start: s.start,
        end: s.end,
        title: person.reparto,
      }));
    });
  }, [result, mapping]);

  const abbinate = result
    ? result.people.filter((p) => mapping[p.index] && mapping[p.index] !== SCOPERTO).length
    : 0;
  const mismatches = result?.people.filter((p) => p.mismatches.length > 0) ?? [];

  function onImport() {
    if (!result) return;
    startImport(async () => {
      const response = await importaTurni({
        shifts: shiftsToImport,
        giorni: result.days,
        sostituisci,
      });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success(
        response.rimossi > 0
          ? `${response.inseriti} turni importati, ${response.rimossi} sostituiti. Restano da pubblicare.`
          : `${response.inseriti} turni importati. Restano da pubblicare.`,
      );
      router.push(`/turni?s=${result.days[0]}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/turni"
          aria-label="Torna ai turni"
          className="tap grid size-8 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Importa turni</h1>
          <p className="text-[13.5px] text-muted">
            Da un foglio Excel o CSV. Niente viene salvato finché non lo dici tu.
          </p>
        </div>
      </div>

      {!result ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) analyze(file);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
            dragging
              ? "border-accent bg-accent-soft"
              : "border-border-strong bg-surface hover:border-accent",
          )}
        >
          <div className="grid size-12 place-items-center rounded-full bg-surface-3 text-muted">
            {analyzing ? (
              <Upload className="size-5 animate-pulse" />
            ) : (
              <FileSpreadsheet className="size-5" />
            )}
          </div>
          <div>
            <p className="text-[15px] font-medium">
              {analyzing ? `Leggo ${fileName}…` : "Trascina qui il foglio dei turni"}
            </p>
            <p className="mt-1 text-[13.5px] text-muted">
              oppure tocca per sceglierlo
            </p>
          </div>
          <p className="text-[12.5px] text-faint">
            .xlsx o .csv, fino a 5 MB. Il vecchio .xls va prima salvato come .xlsx.
          </p>
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            className="sr-only"
            disabled={analyzing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) analyze(file);
              e.target.value = "";
            }}
          />
        </label>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Riepilogo etichetta="File" valore={fileName ?? "—"} />
              <Riepilogo
                etichetta="Periodo"
                maiuscola
                valore={
                  result.days.length
                    ? `${dayLong(fromISODate(result.days[0]))} → ${dayLong(fromISODate(result.days[result.days.length - 1]))}`
                    : "—"
                }
              />
              <Riepilogo etichetta="Persone" valore={String(result.people.length)} />
              <Riepilogo
                etichetta="Turni"
                valore={String(result.people.reduce((n, p) => n + p.shifts.length, 0))}
              />
            </div>
          </div>

          {mismatches.length > 0 ? (
            <Avviso tipo="grave" titolo="Le ore non tornano">
              <p>
                Per {mismatches.length}{" "}
                {mismatches.length === 1 ? "persona" : "persone"} le ore che ho
                calcolato non coincidono con la colonna dei totali del file. Vuol
                dire che ho letto male qualche casella: controlla prima di
                importare.
              </p>
              {/* `cifre` sui numeri, non sulla riga: lo zero barrato dentro
                  un cognome sembra un errore di battitura, e la prosa a
                  larghezza fissa si legge peggio. */}
              <ul className="mt-2 space-y-0.5">
                {mismatches.slice(0, 6).map((p) => (
                  <li key={p.index}>
                    <strong>{p.fullName}</strong> —{" "}
                    {p.mismatches.map((m, k) => (
                      <span key={k}>
                        {k > 0 ? "; " : ""}
                        <span className="cifre">{m.date}</span>: nel file{" "}
                        <span className="cifre">{m.dichiarato}h</span>, calcolate{" "}
                        <span className="cifre">{m.calcolato.toFixed(2)}h</span>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </Avviso>
          ) : (
            <Avviso tipo="ok" titolo="Ore verificate">
              Per ogni persona le ore che ho calcolato coincidono con i totali
              scritti nel file.
            </Avviso>
          )}

          {result.warnings.length > 0 ? (
            <Avviso tipo="attenzione" titolo={`${result.warnings.length} caselle non capite`}>
              <ul className="space-y-0.5">
                {result.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {result.warnings.length > 8 ? (
                  <li className="text-faint">…e altre {result.warnings.length - 8}.</li>
                ) : null}
              </ul>
            </Avviso>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
              <p className="text-[13px] font-medium">
                Chi è chi
                <span className="ml-2 font-normal text-muted">
                  {abbinate} di {result.people.length} abbinati
                </span>
              </p>
            </div>

            <ul className="divide-y divide-border">
              {result.people.map((person) => {
                const value = mapping[person.index] ?? IGNORA;
                const ore = minutesOf(person);
                const codici = [...new Set(person.markers.map((m) => m.label))];

                return (
                  <li
                    key={person.index}
                    className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[14px] font-medium">
                          {person.fullName}
                        </p>
                        {person.reparto ? (
                          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[12px] text-muted">
                            {person.reparto}
                          </span>
                        ) : null}
                      </div>
                      {/* `cifre` sul conteggio e sulla durata, non sui codici
                          delle assenze, che sono lettere. */}
                      <p className="text-[12.5px] text-muted">
                        <span className="cifre">{person.shifts.length}</span>{" "}
                        {person.shifts.length === 1 ? "turno" : "turni"} ·{" "}
                        <span className="cifre">{formatDuration(ore)}</span>
                        {codici.length ? ` · ${codici.join(", ")}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:w-72">
                      {value && value !== SCOPERTO ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                      <Select
                        aria-label={`Abbina ${person.fullName}`}
                        value={value}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [person.index]: e.target.value }))
                        }
                      >
                        <option value={IGNORA}>Non importare</option>
                        <option value={SCOPERTO}>Scoperto</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sostituisci}
                onChange={(e) => setSostituisci(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[14px] font-medium">
                  Sostituisci i turni già presenti in queste date
                </span>
                <span className="block text-[13px] text-muted">
                  Consigliato: importando due volte lo stesso foglio, senza questa
                  opzione ogni turno comparirebbe doppio.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
            <Button variant="ghost" onClick={reset} disabled={importing}>
              Cambia file
            </Button>
            <Button
              onClick={onImport}
              loading={importing}
              disabled={shiftsToImport.length === 0}
            >
              Importa {shiftsToImport.length} turni
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Riepilogo({
  etichetta,
  valore,
  maiuscola,
}: {
  etichetta: string;
  valore: string;
  /** Solo per i testi che generiamo noi: un nome di file va lasciato com'è. */
  maiuscola?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] uppercase tracking-wide text-faint">{etichetta}</p>
      <p
        className={cn(
          "truncate text-[14px] font-medium",
          maiuscola && "first-letter:uppercase",
        )}
      >
        {valore}
      </p>
    </div>
  );
}

function Avviso({
  tipo,
  titolo,
  children,
}: {
  tipo: "ok" | "attenzione" | "grave";
  titolo: string;
  children: React.ReactNode;
}) {
  const stile = {
    ok: "bg-success-soft text-success",
    attenzione: "bg-warning-soft text-warning",
    grave: "bg-danger-soft text-danger",
  }[tipo];

  const Icon = tipo === "ok" ? CheckCircle2 : AlertTriangle;

  return (
    <div className={cn("rounded-2xl px-4 py-3.5 text-[13px]", stile)}>
      <p className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold">
        <Icon className="size-4" />
        {titolo}
      </p>
      {/* Senza opacity: qui dentro c'e' l'elenco degli errori, cioe' la
          ragione per cui l'avviso esiste. Il titolo si stacca da solo, con
          l'icona e il grassetto. */}
      <div>{children}</div>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { Field, Input, Select } from "@/components/ui/field";
import type { Department } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Rapporto = {
  /** Reparto principale: quello scritto accanto al nome. */
  department_id: string | null;
  /** Tutti quelli in cui può lavorare, principale compreso. */
  reparti: string[];
  on_call: boolean;
  contract_hours: number | null;
  /** Orario preimpostato dal contratto (HH:MM), facoltativo. Vincola solo
   *  se l'azienda accende gli orari preimpostati nelle impostazioni. */
  preset_start: string | null;
  preset_end: string | null;
};

/** Reparti e tipo di rapporto.
 *
 *  Una persona può lavorare in più reparti — non contemporaneamente: in un
 *  turno fa una cosa sola, ma chi sta in cucina il lunedì può stare in sala
 *  il sabato. Vale anche per il responsabile.
 *
 *  Le ore e "a chiamata" sono due risposte alla stessa domanda, quindi si
 *  scelgono con un interruttore: così non si può salvare "a chiamata con 20
 *  ore", che non vorrebbe dire niente. */
export function CampiRapporto({
  reparti,
  valore,
  onChange,
  idPrefisso = "",
}: {
  reparti: Department[];
  valore: Rapporto;
  onChange: (v: Rapporto) => void;
  idPrefisso?: string;
}) {
  const id = (n: string) => `${idPrefisso}${n}`;
  const scelti = valore.reparti;

  function alterna(repartoId: string) {
    const dentro = scelti.includes(repartoId);
    const nuovi = dentro
      ? scelti.filter((r) => r !== repartoId)
      : [...scelti, repartoId];

    // Togliendo il principale ne subentra un altro: lasciare scritto accanto
    // al nome un reparto in cui non lavora più sarebbe una bugia.
    const principale = nuovi.includes(valore.department_id ?? "")
      ? valore.department_id
      : (nuovi[0] ?? null);

    onChange({ ...valore, reparti: nuovi, department_id: principale });
  }

  return (
    <>
      <Field
        label="Reparti in cui lavora"
        htmlFor={id("reparti")}
        hint={
          reparti.length === 0
            ? "Nessun reparto ancora: si creano dalla Supervisione."
            : "Anche più di uno. In un turno ne fa uno solo, ma può cambiare da un giorno all'altro."
        }
      >
        {reparti.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
            Senza reparti non c&apos;è niente da scegliere.
          </p>
        ) : (
          <div
            id={id("reparti")}
            role="group"
            aria-label="Reparti"
            className="flex flex-wrap gap-1.5"
          >
            {reparti.map((r) => {
              const dentro = scelti.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={dentro}
                  onClick={() => alterna(r.id)}
                  className={cn(
                    "tap flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium uppercase tracking-wide",
                    dentro
                      ? "pastiglia-reparto"
                      : "bg-surface-3 text-faint hover:text-muted",
                  )}
                  style={dentro ? { ["--tinta" as string]: r.hue } : undefined}
                >
                  {dentro ? <Check className="size-3" /> : null}
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {/* Il principale si sceglie solo quando c'è davvero da scegliere. */}
      {scelti.length > 1 ? (
        <Field
          label="Reparto principale"
          htmlFor={id("principale")}
          hint="Quello scritto accanto al nome, e la scelta di partenza per un turno nuovo."
        >
          <Select
            id={id("principale")}
            value={valore.department_id ?? ""}
            onChange={(e) =>
              onChange({ ...valore, department_id: e.target.value || null })
            }
          >
            {reparti
              .filter((r) => scelti.includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Tipo di rapporto" htmlFor={id("ore")}>
        <div
          role="radiogroup"
          aria-label="Tipo di rapporto"
          className="mb-2 flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
        >
          {(
            [
              [false, "Ore da contratto"],
              [true, "A chiamata"],
            ] as const
          ).map(([chiamata, testo]) => (
            <button
              key={String(chiamata)}
              type="button"
              role="radio"
              aria-checked={valore.on_call === chiamata}
              onClick={() =>
                onChange({
                  ...valore,
                  on_call: chiamata,
                  contract_hours: chiamata ? null : (valore.contract_hours ?? 40),
                })
              }
              className={cn(
                "tap h-8 flex-1 rounded-full text-[13px] font-medium",
                valore.on_call === chiamata
                  ? "bg-surface text-text shadow-soft"
                  : "text-muted hover:text-text",
              )}
            >
              {testo}
            </button>
          ))}
        </div>

        {valore.on_call ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
            Nessun monte ore da rispettare: lavora quando viene chiamata.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input
                id={id("ore")}
                type="number"
                min={0}
                max={80}
                step={0.5}
                value={valore.contract_hours ?? ""}
                onChange={(e) =>
                  onChange({
                    ...valore,
                    contract_hours: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="40"
                className="w-28"
                aria-label="Ore settimanali da contratto"
              />
              <span className="text-[13px] text-muted">ore a settimana</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted">Orario preimpostato</span>
              <Input
                type="time"
                value={valore.preset_start ?? ""}
                onChange={(e) =>
                  onChange({ ...valore, preset_start: e.target.value || null })
                }
                className="w-28"
                aria-label="Inizio dell'orario preimpostato"
              />
              <span className="text-faint">–</span>
              <Input
                type="time"
                value={valore.preset_end ?? ""}
                onChange={(e) =>
                  onChange({ ...valore, preset_end: e.target.value || null })
                }
                className="w-28"
                aria-label="Fine dell'orario preimpostato"
              />
            </div>
            <p className="mt-1 text-[12.5px] text-faint">
              Facoltativo: l&apos;orario scritto sul contratto. Conta solo se
              l&apos;azienda accende gli orari preimpostati nelle impostazioni.
            </p>
          </>
        )}
      </Field>
    </>
  );
}

/** Come si scrive il rapporto in un elenco. */
export function etichettaRapporto(p: {
  on_call: boolean;
  contract_hours: number | null;
}): string | null {
  if (p.on_call) return "a chiamata";
  if (p.contract_hours === null) return null;
  const n = Number(p.contract_hours);
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")}h a settimana`;
}

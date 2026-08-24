"use client";

import * as React from "react";
import { Field, Input, Select } from "@/components/ui/field";
import type { Department } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Rapporto = {
  department_id: string | null;
  on_call: boolean;
  contract_hours: number | null;
};

/** Reparto e tipo di rapporto. Le ore e "a chiamata" sono due risposte alla
 *  stessa domanda, quindi si scelgono con un interruttore: così non si può
 *  salvare "a chiamata con 20 ore", che non vorrebbe dire niente. */
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

  return (
    <>
      <Field
        label="Reparto"
        htmlFor={id("department")}
        hint={
          reparti.length === 0
            ? "Nessun reparto ancora: si creano dalla Supervisione."
            : undefined
        }
      >
        <Select
          id={id("department")}
          value={valore.department_id ?? ""}
          onChange={(e) =>
            onChange({ ...valore, department_id: e.target.value || null })
          }
          disabled={reparti.length === 0}
        >
          <option value="">— Nessun reparto —</option>
          {reparti.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

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

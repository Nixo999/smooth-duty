"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { salvaImpostazioni } from "@/app/(app)/impostazioni/actions";
import { Button } from "@/components/ui/button";
import { CAUSALI } from "@/lib/assenze";
import type { Impostazioni as Valori } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

/** Le regole generali dell'azienda. Sono le stesse che l'amministratore
 *  sceglie creando l'azienda: qui il responsabile le cambia dopo. */
export function Impostazioni({
  valori,
  azienda,
}: {
  valori: Valori;
  azienda: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState<Valori>(valori);

  const cambia = (patch: Partial<Valori>) => setV((prima) => ({ ...prima, ...patch }));

  const commutaCausale = (codice: string) =>
    cambia({
      causali_richiedibili: v.causali_richiedibili.includes(codice)
        ? v.causali_richiedibili.filter((c) => c !== codice)
        : [...v.causali_richiedibili, codice],
    });

  function salva() {
    start(async () => {
      const esito = await salvaImpostazioni(v);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Impostazioni salvate.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-[13.5px] text-muted">
          Valgono per tutta l&apos;azienda «{azienda}».
        </p>
      </div>

      <Sezione titolo="Cosa vedono i dipendenti">
        <Interruttore
          acceso={v.supervisione_dipendenti}
          onCambia={(x) => cambia({ supervisione_dipendenti: x })}
          titolo="Supervisione visibile ai dipendenti"
          descrizione="Spenta, la pagina resta solo al responsabile: ai dipendenti sparisce dal menu."
        />
      </Sezione>

      <Sezione
        titolo="Conferme dei dipendenti"
        nota="Il turno resta valido e visibile, ma segnato «da confermare» finché l'interessato non accetta."
      >
        <Interruttore
          acceso={v.conferma_straordinari}
          onCambia={(x) => cambia({ conferma_straordinari: x })}
          titolo="Straordinari da accettare"
          descrizione="Un turno nuovo che porta oltre le ore da contratto va accettato dall'interessato."
        />
        <Interruttore
          acceso={v.conferma_modifiche_straordinari}
          onCambia={(x) => cambia({ conferma_modifiche_straordinari: x })}
          titolo="Modifiche con straordinario da accettare"
          descrizione="Modificare un turno di una settimana già pubblicata, se genera straordinario."
        />
        <Interruttore
          acceso={v.conferma_modifiche}
          onCambia={(x) => cambia({ conferma_modifiche: x })}
          titolo="Altre modifiche da accettare"
          descrizione="Modificare un turno di una settimana già pubblicata, anche senza straordinario."
        />
        <Interruttore
          acceso={v.orari_preimpostati}
          onCambia={(x) => cambia({ orari_preimpostati: x })}
          titolo="Orari preimpostati da contratto"
          descrizione="A chi ha un orario scritto sul contratto, un turno con un orario diverso va accettato. L'orario si scrive sulla persona, in Squadra."
        />
      </Sezione>

      <Sezione
        titolo="Permessi richiedibili"
        nota="Le causali che un dipendente può chiedere dalla pagina Permessi. Il responsabile, registrando a mano, le ha sempre tutte."
      >
        <div className="space-y-3">
          {CAUSALI.map((gruppo) => (
            <div key={gruppo.gruppo}>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">
                {gruppo.gruppo}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gruppo.voci.map(([codice, nome]) => {
                  const dentro = v.causali_richiedibili.includes(codice);
                  return (
                    <button
                      key={codice}
                      type="button"
                      aria-pressed={dentro}
                      onClick={() => commutaCausale(codice)}
                      className={cn(
                        "tap rounded-full px-3 py-1.5 text-[12.5px] font-medium",
                        dentro
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-3 text-faint line-through hover:text-muted",
                      )}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sezione>

      <div className="flex justify-end">
        <Button onClick={salva} loading={pending}>
          Salva impostazioni
        </Button>
      </div>
    </div>
  );
}

function Sezione({
  titolo,
  nota,
  children,
}: {
  titolo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <header className="border-b border-border bg-surface-2 px-4 py-2.5">
        <p className="text-[13px] font-medium">{titolo}</p>
        {nota ? <p className="text-[12px] text-faint">{nota}</p> : null}
      </header>
      <div className="divide-y divide-border px-4">{children}</div>
    </section>
  );
}

function Interruttore({
  acceso,
  onCambia,
  titolo,
  descrizione,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  descrizione: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{titolo}</p>
        <p className="text-[12.5px] text-muted">{descrizione}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={acceso}
        aria-label={titolo}
        onClick={() => onCambia(!acceso)}
        className={cn(
          "tap relative h-6 w-11 shrink-0 rounded-full transition-colors",
          acceso ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-surface shadow-soft transition-[left]",
            acceso ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

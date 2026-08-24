"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  aggiungiPersona,
  aggiungiPersoneDaElenco,
} from "@/app/(app)/squadra/actions";
import {
  CampiRapporto,
  type Rapporto,
} from "@/components/squadra/campi-rapporto";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { nomiDaElenco } from "@/lib/elenco";
import { generatePassword } from "@/lib/password";
import type { Department, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type Modo = "una" | "elenco";

/** Aggiungere persone, in due modi.
 *
 *  L'accesso all'app è facoltativo: si mette in squadra chi lavora, e l'email
 *  si dà dopo a chi davvero userà l'app. Pretendere trenta indirizzi prima di
 *  poter scrivere il primo turno è un ostacolo senza ragione. */
export function AggiungiPersone({
  reparti,
  onClose,
  onDone,
}: {
  reparti: Department[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [modo, setModo] = React.useState<Modo>("una");
  const [attesa, start] = React.useTransition();

  const [conAccesso, setConAccesso] = React.useState(false);
  const [password, setPassword] = React.useState(generatePassword);
  const [elenco, setElenco] = React.useState("");
  const [rapporto, setRapporto] = React.useState<Rapporto>({
    preset_start: null,
    preset_end: null,
    contract_type: "part_time",
    department_id: null,
    reparti: [],
    on_call: false,
    contract_hours: 40,
  });

  const nomi = React.useMemo(() => nomiDaElenco(elenco), [elenco]);

  function unaPersona(formData: FormData) {
    start(async () => {
      const r = await aggiungiPersona({
        fullName: String(formData.get("fullName")),
        role: String(formData.get("role")) as Role,
        accesso: conAccesso
          ? {
              email: String(formData.get("email")),
              password: String(formData.get("password")),
            }
          : null,
        ...rapporto,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        conAccesso ? "Persona aggiunta con il suo accesso." : "Persona aggiunta.",
      );
      onDone();
    });
  }

  function daElenco() {
    start(async () => {
      const r = await aggiungiPersoneDaElenco(elenco, rapporto);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.creati} ${r.creati === 1 ? "persona aggiunta" : "persone aggiunte"}.`,
      );
      onDone();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Aggiungi persone"
      description="L'accesso all'app si può dare adesso o più avanti."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          {modo === "una" ? (
            <Button type="submit" form="una-persona" loading={attesa}>
              Aggiungi
            </Button>
          ) : (
            <Button
              type="button"
              onClick={daElenco}
              loading={attesa}
              disabled={nomi.length === 0}
            >
              Aggiungi {nomi.length || ""}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="radiogroup"
          aria-label="Come aggiungere"
          className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
        >
          {(
            [
              ["una", "Una persona"],
              ["elenco", "Elenco di nomi"],
            ] as const
          ).map(([valore, testo]) => (
            <button
              key={valore}
              type="button"
              role="radio"
              aria-checked={modo === valore}
              onClick={() => setModo(valore)}
              className={cn(
                "tap h-8 flex-1 rounded-full text-[13px] font-medium",
                modo === valore
                  ? "bg-surface text-text shadow-soft"
                  : "text-muted hover:text-text",
              )}
            >
              {testo}
            </button>
          ))}
        </div>

        {modo === "una" ? (
          <form id="una-persona" action={unaPersona} className="space-y-4">
            <Field label="Nome e cognome" htmlFor="fullName">
              <Input
                id="fullName"
                name="fullName"
                placeholder="Giulia Bianchi"
                required
              />
            </Field>

            <Field label="Ruolo" htmlFor="role">
              <Select
                id="role"
                name="role"
                defaultValue="dipendente"
                onChange={(e) => {
                  // Un responsabile deve poter entrare, altrimenti l'azienda
                  // resta con un capo che non ci accede.
                  if (e.target.value === "capo") setConAccesso(true);
                }}
              >
                <option value="dipendente">Dipendente — vede solo i suoi turni</option>
                <option value="capo">Responsabile — gestisce turni e squadra</option>
              </Select>
            </Field>

            <div className="rounded-xl border border-border bg-surface-2 p-3.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={conAccesso}
                  onChange={(e) => setConAccesso(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-[13.5px] font-medium">
                    Dagli l&apos;accesso all&apos;app
                  </span>
                  <span className="block text-[12.5px] text-muted">
                    Serve solo a chi guarderà i turni dal telefono. Si può
                    aggiungere più avanti.
                  </span>
                </span>
              </label>

              {conAccesso ? (
                <div className="mt-3 space-y-4 border-t border-border pt-3">
                  <Field label="Email" htmlFor="email">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="giulia@azienda.it"
                      required
                    />
                  </Field>
                  <PasswordField value={password} onChange={setPassword} />
                </div>
              ) : null}
            </div>

            <CampiRapporto
              reparti={reparti}
              valore={rapporto}
              onChange={setRapporto}
              idPrefisso="nuovo-"
            />
          </form>
        ) : (
          <div className="space-y-4">
            <Field
              label="Nomi"
              htmlFor="elenco"
              hint="Separati da virgola, punto e virgola o a capo. Nessuno di loro avrà un accesso: si dà dopo, a chi serve."
            >
              <Textarea
                id="elenco"
                value={elenco}
                onChange={(e) => setElenco(e.target.value)}
                placeholder="Mario Rossi, Anna Bianchi, Luca Verdi"
                className="min-h-28"
              />
            </Field>

            {nomi.length > 0 ? (
              <div className="rounded-xl border border-border bg-surface-2 p-3.5">
                <p className="mb-2 text-[12px] uppercase tracking-wide text-faint">
                  {nomi.length} {nomi.length === 1 ? "nome" : "nomi"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {nomi.slice(0, 40).map((n) => (
                    <span
                      key={n}
                      className="rounded-full bg-surface-3 px-2.5 py-1 text-[12.5px]"
                    >
                      {n}
                    </span>
                  ))}
                  {nomi.length > 40 ? (
                    <span className="px-1 py-1 text-[12.5px] text-faint">
                      …e altri {nomi.length - 40}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] text-faint">
                  Chi è già in squadra viene saltato: incollare due volte lo
                  stesso elenco non crea doppioni.
                </p>
              </div>
            ) : null}

            <CampiRapporto
              reparti={reparti}
              valore={rapporto}
              onChange={setRapporto}
              idPrefisso="elenco-"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

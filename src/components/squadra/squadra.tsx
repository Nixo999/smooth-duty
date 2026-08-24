"use client";

import { KeyRound, LogIn, Plus, Trash2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  creaAccesso,
  modificaPersona,
  reimpostaPassword,
  rimuoviPersona,
} from "@/app/(app)/squadra/actions";
import { AggiungiPersone } from "@/components/squadra/aggiungi-persone";
import {
  CampiRapporto,
  etichettaRapporto,
  type Rapporto,
} from "@/components/squadra/campi-rapporto";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { generatePassword } from "@/lib/password";
import { AssenzaPersona } from "@/components/squadra/assenza-persona";
import { assenzaAperta, ETICHETTA } from "@/lib/assenze";
import type { Absence, Department, Profile, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Squadra({
  people,
  reparti,
  assenze,
  currentUserId,
}: {
  people: Profile[];
  reparti: Department[];
  assenze: Absence[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Profile | null>(null);

  const nomeReparto = (id: string | null) =>
    reparti.find((r) => r.id === id) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Squadra</h1>
          <p className="text-[13.5px] text-muted">
            {people.length} {people.length === 1 ? "persona" : "persone"}
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Aggiungi persona</span>
          <span className="sm:hidden">Aggiungi</span>
        </Button>
      </div>

      <ul className="stagger overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {people.map((p, i) => {
          const reparto = nomeReparto(p.department_id);
          const rapporto = etichettaRapporto(p);
          return (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5",
                i > 0 && "border-t border-border",
                !p.active && "opacity-55",
              )}
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                {p.full_name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("")}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-[14.5px] font-medium">{p.full_name}</p>
                  {reparto ? (
                    <span
                      className="pastiglia-reparto rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
                      style={{ ["--tinta" as string]: reparto.hue }}
                    >
                      {reparto.name}
                    </span>
                  ) : null}
                  {p.role === "capo" ? (
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted">
                      responsabile
                    </span>
                  ) : null}
                  {!p.active ? (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                      sospeso
                    </span>
                  ) : null}
                  {assenzaAperta(assenze, p.id) ? (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                      {ETICHETTA(assenzaAperta(assenze, p.id)?.type)}
                    </span>
                  ) : null}
                  {!p.user_id ? (
                    <span
                      className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted"
                      title="Sta in squadra e va in turno, ma non può entrare nell'app"
                    >
                      nessun accesso
                    </span>
                  ) : null}
                  {p.must_change_password ? (
                    <span
                      className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
                      title="Non ha ancora fatto il primo accesso"
                    >
                      password provvisoria
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-[13px] text-muted">
                  {p.email ?? "—"}
                  {rapporto ? ` · ${rapporto}` : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditing(p)}
                aria-label={`Modifica ${p.full_name}`}
                className="tap grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
              >
                <UserCog className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <AggiungiPersone
          reparti={reparti}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditDialog
          person={editing}
          reparti={reparti}
          inCorso={assenzaAperta(assenze, editing.id)}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** Dare l'accesso a chi è già in squadra ma finora non entrava nell'app. */
function DaiAccesso({
  person,
  onFatto,
}: {
  person: Profile;
  onFatto: () => void;
}) {
  const [attesa, start] = React.useTransition();
  const [aperto, setAperto] = React.useState(false);
  const [password, setPassword] = React.useState(generatePassword);

  function crea(formData: FormData) {
    start(async () => {
      const r = await creaAccesso(
        person.id,
        String(formData.get("email")),
        String(formData.get("password")),
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Accesso creato. Consegna email e password.");
      onFatto();
    });
  }

  if (!aperto) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">Nessun accesso</p>
          <p className="text-[12.5px] text-muted">
            Va in turno e compare nei conti, ma nell&apos;app non può entrare.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setPassword(generatePassword());
            setAperto(true);
          }}
        >
          <LogIn className="size-3.5" />
          Dai accesso
        </Button>
      </div>
    );
  }

  return (
    <form
      action={crea}
      className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2 p-3.5"
    >
      <Field label="Email" htmlFor="accesso-email">
        <Input
          id="accesso-email"
          name="email"
          type="email"
          placeholder="nome@azienda.it"
          required
        />
      </Field>
      <PasswordField value={password} onChange={setPassword} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAperto(false)}
        >
          Annulla
        </Button>
        <Button type="submit" size="sm" loading={attesa}>
          Crea accesso
        </Button>
      </div>
    </form>
  );
}

function EditDialog({
  person,
  reparti,
  inCorso,
  isSelf,
  onClose,
  onDone,
}: {
  person: Profile;
  reparti: Department[];
  inCorso: Absence | null;
  isSelf: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState(generatePassword);
  const [rapporto, setRapporto] = React.useState<Rapporto>({
    department_id: person.department_id,
    reparti: person.reparti,
    on_call: person.on_call,
    contract_hours:
      person.contract_hours === null ? null : Number(person.contract_hours),
  });

  function onReset() {
    startTransition(async () => {
      const result = await reimpostaPassword(person.id, newPassword);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Password reimpostata. Consegnagliela.");
      setResetting(false);
      onDone();
    });
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await modificaPersona({
        id: person.id,
        fullName: String(formData.get("fullName")),
        role: String(formData.get("role")) as Role,
        active: formData.get("active") === "attivo",
        ...rapporto,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Modifiche salvate.");
      onDone();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await rimuoviPersona(person.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Persona rimossa.");
      onDone();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={person.full_name}
      description={person.email ?? "Nessun accesso"}
      footer={
        <>
          {!isSelf ? (
            confirmDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-[13px] text-muted">Sicuro?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={onDelete}
                  loading={pending}
                >
                  Elimina
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-danger hover:bg-danger-soft"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
                Elimina
              </Button>
            )
          ) : null}

          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="edit-person" loading={pending}>
            Salva
          </Button>
        </>
      }
    >
      <form id="edit-person" action={onSubmit} className="space-y-4">
        <Field label="Nome e cognome" htmlFor="edit-fullName">
          <Input
            id="edit-fullName"
            name="fullName"
            defaultValue={person.full_name}
            required
          />
        </Field>

        <Field label="Ruolo" htmlFor="edit-role">
          <Select
            id="edit-role"
            name="role"
            defaultValue={person.role}
            disabled={isSelf}
          >
            <option value="dipendente">Dipendente — vede solo i suoi turni</option>
            <option value="capo">Responsabile — gestisce turni e squadra</option>
          </Select>
        </Field>

        <CampiRapporto
          reparti={reparti}
          valore={rapporto}
          onChange={setRapporto}
          idPrefisso="edit-"
        />

        <Field
          label="Accesso"
          htmlFor="edit-active"
          hint={
            isSelf
              ? "Non puoi sospendere te stesso."
              : "Chi è sospeso non può più entrare, ma i suoi turni restano."
          }
        >
          <Select
            id="edit-active"
            name="active"
            defaultValue={person.active ? "attivo" : "sospeso"}
            disabled={isSelf}
          >
            <option value="attivo">Attivo</option>
            <option value="sospeso">Sospeso</option>
          </Select>
        </Field>
      </form>

      <AssenzaPersona
        profileId={person.id}
        inCorso={inCorso}
        onFatto={onDone}
      />

      {/* Fuori dal form: sono azioni a se', non vanno salvate col resto. */}
      {!person.user_id ? (
        <DaiAccesso person={person} onFatto={onDone} />
      ) : null}

      {!isSelf && person.user_id ? (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3.5">
          {resetting ? (
            <div className="space-y-3">
              <PasswordField
                id="reset-password"
                name="reset-password"
                label="Nuova password provvisoria"
                hint="La vecchia smette di funzionare subito."
                value={newPassword}
                onChange={setNewPassword}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetting(false)}
                >
                  Annulla
                </Button>
                <Button type="button" size="sm" onClick={onReset} loading={pending}>
                  Reimposta
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">Password dimenticata?</p>
                <p className="text-[12.5px] text-muted">
                  Assegnane una provvisoria da consegnarle.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setNewPassword(generatePassword());
                  setResetting(true);
                }}
              >
                <KeyRound className="size-3.5" />
                Reimposta
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

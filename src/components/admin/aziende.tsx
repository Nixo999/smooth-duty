"use client";

import { Building2, ListPlus, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  creaAccountInAzienda,
  creaAzienda,
  creaPersoneInAzienda,
  eliminaAzienda,
  rinominaAzienda,
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { generatePassword } from "@/lib/password";
import { nomiDaElenco } from "@/lib/elenco";
import type { CompanyRow, Role } from "@/lib/types";

export function Aziende({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<CompanyRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Aziende</h1>
          <p className="text-[13.5px] text-muted">
            {companies.length}{" "}
            {companies.length === 1 ? "azienda attiva" : "aziende attive"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuova azienda</span>
          <span className="sm:hidden">Nuova</span>
        </Button>
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-surface-3 text-muted">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="text-[15px] font-medium">Nessuna azienda</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Creane una e consegna le credenziali al suo responsabile.
            </p>
          </div>
        </div>
      ) : (
        <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Building2 className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-tight">
                    {c.name}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {c.people} {c.people === 1 ? "persona" : "persone"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  aria-label={`Gestisci ${c.name}`}
                  className="tap grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>

              <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-faint">
                  Responsabile
                </p>
                {c.responsabili.length === 0 ? (
                  <p className="mt-0.5 text-[13px] text-warning">
                    Nessuno — l&apos;azienda non è raggiungibile
                  </p>
                ) : (
                  c.responsabili.map((r) => (
                    <div key={r.email} className="mt-0.5">
                      <p className="truncate text-[13.5px]">{r.full_name}</p>
                      <p className="truncate text-[12.5px] text-muted">{r.email}</p>
                    </div>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <CreateDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditDialog
          company={editing}
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

function CreateDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [password, setPassword] = React.useState(generatePassword);
  const [conResponsabile, setConResponsabile] = React.useState(true);
  const [elenco, setElenco] = React.useState("");
  const [impostazioni, setImpostazioni] = React.useState({
    supervisione_dipendenti: true,
    conferma_straordinari: false,
    conferma_modifiche: false,
    orari_preimpostati: false,
  });

  const nomi = React.useMemo(() => nomiDaElenco(elenco), [elenco]);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await creaAzienda({
        companyName: String(formData.get("companyName")),
        responsabile: conResponsabile
          ? {
              fullName: String(formData.get("fullName")),
              email: String(formData.get("email")),
              password: String(formData.get("password")),
            }
          : null,
        elenco: elenco.trim() || null,
        impostazioni,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        conResponsabile
          ? "Azienda creata. Consegna le credenziali al responsabile."
          : "Azienda creata.",
      );
      onDone();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nuova azienda"
      description="Il responsabile e la squadra si possono aggiungere anche dopo."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="create-company" loading={pending}>
            Crea
          </Button>
        </>
      }
    >
      <form id="create-company" action={onSubmit} className="space-y-4">
        <Field label="Nome dell'azienda" htmlFor="companyName">
          <Input
            id="companyName"
            name="companyName"
            placeholder="Bar Centrale"
            required
          />
        </Field>

        <div className="rounded-xl border border-border bg-surface-2 p-3.5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={conResponsabile}
              onChange={(e) => setConResponsabile(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-[13.5px] font-medium">
                Crea anche il responsabile
              </span>
              <span className="block text-[12.5px] text-muted">
                Senza, l&apos;azienda nasce vuota e nessuno pu&ograve; ancora
                entrarci: l&apos;accesso si d&agrave; pi&ugrave; avanti.
              </span>
            </span>
          </label>

          {conResponsabile ? (
            <div className="mt-3 space-y-4 border-t border-border pt-3">
              <Field label="Nome e cognome" htmlFor="fullName">
                <Input id="fullName" name="fullName" placeholder="Mario Rossi" required />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="mario@barcentrale.it"
                  required
                />
              </Field>
              <PasswordField value={password} onChange={setPassword} />
            </div>
          ) : null}
        </div>

        <Field
          label="Squadra"
          htmlFor="elenco"
          hint="Facoltativa. Nomi separati da virgola: entrano in squadra senza accesso all'app."
        >
          <Textarea
            id="elenco"
            value={elenco}
            onChange={(e) => setElenco(e.target.value)}
            placeholder="Mario Rossi, Anna Bianchi, Luca Verdi"
            className="min-h-20"
          />
        </Field>

        {nomi.length > 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            {nomi.length} {nomi.length === 1 ? "persona" : "persone"}: {nomi.slice(0, 8).join(", ")}
            {nomi.length > 8 ? ` e altri ${nomi.length - 8}` : ""}
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-surface-2 p-3.5">
          <p className="text-[13.5px] font-medium">Impostazioni generali</p>
          <p className="mb-2 text-[12.5px] text-muted">
            Il responsabile potrà cambiarle dalla sua pagina Impostazioni.
          </p>
          <div className="space-y-2">
            {(
              [
                ["supervisione_dipendenti", "Supervisione visibile ai dipendenti"],
                ["conferma_straordinari", "Straordinari rifiutabili dall'interessato"],
                [
                  "conferma_modifiche",
                  "Modifiche a settimana pubblicata: l'interessato viene coinvolto",
                ],
                ["orari_preimpostati", "Orari preimpostati da contratto"],
              ] as const
            ).map(([chiave, testo]) => (
              <label key={chiave} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={impostazioni[chiave]}
                  onChange={(e) =>
                    setImpostazioni({ ...impostazioni, [chiave]: e.target.checked })
                  }
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="text-[13px]">{testo}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Le persone dell'azienda, con la possibilità di aggiungerne.
 *
 *  L'amministratore normalmente non ci mette mano — gli account li fa il
 *  responsabile dalla sua Squadra — ma serve quando un'azienda resta senza
 *  nessuno che possa entrarci, o quando ne serve un secondo. */
function Persone({
  company,
  onFatto,
}: {
  company: CompanyRow;
  onFatto: () => void;
}) {
  const router = useRouter();
  const [attesa, start] = React.useTransition();
  const [aggiungi, setAggiungi] = React.useState(false);
  const [elencoAperto, setElencoAperto] = React.useState(false);
  const [elenco, setElenco] = React.useState("");
  const [password, setPassword] = React.useState(generatePassword);

  const nomi = React.useMemo(() => nomiDaElenco(elenco), [elenco]);

  function onElenco() {
    start(async () => {
      const r = await creaPersoneInAzienda(company.id, elenco);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.creati} ${r.creati === 1 ? "persona aggiunta" : "persone aggiunte"}.`,
      );
      setElenco("");
      setElencoAperto(false);
      router.refresh();
      onFatto();
    });
  }

  function onCrea(formData: FormData) {
    start(async () => {
      const r = await creaAccountInAzienda({
        company_id: company.id,
        fullName: String(formData.get("fullName")),
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        role: String(formData.get("role")) as Role,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Account creato. Consegna email e password.");
      setAggiungi(false);
      router.refresh();
      onFatto();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3.5">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">
        Persone
      </p>

      {company.persone.length === 0 ? (
        <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
          Nessuno può entrare in questa azienda. Creane almeno un responsabile.
        </p>
      ) : (
        <ul className="mb-2 space-y-1">
          {company.persone.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]"
            >
              <span className="font-medium">{p.full_name}</span>
              {p.role === "capo" ? (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-muted">
                  responsabile
                </span>
              ) : null}
              {!p.user_id ? (
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-muted">
                  nessun accesso
                </span>
              ) : null}
              {p.must_change_password ? (
                <span
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent"
                  title="Non ha ancora fatto il primo accesso"
                >
                  password provvisoria
                </span>
              ) : null}
              <span className="truncate text-[12.5px] text-muted">
                {p.email ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {aggiungi ? (
        <form action={onCrea} className="space-y-3 border-t border-border pt-3">
          <Field label="Nome e cognome" htmlFor="acc-nome">
            <Input id="acc-nome" name="fullName" placeholder="Mario Rossi" required />
          </Field>
          <Field label="Email" htmlFor="acc-email">
            <Input
              id="acc-email"
              name="email"
              type="email"
              placeholder="mario@azienda.it"
              required
            />
          </Field>
          <PasswordField value={password} onChange={setPassword} />
          <Field label="Ruolo" htmlFor="acc-ruolo">
            <Select id="acc-ruolo" name="role" defaultValue="dipendente">
              <option value="dipendente">Dipendente — vede solo i suoi turni</option>
              <option value="capo">Responsabile — gestisce turni e squadra</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAggiungi(false)}
            >
              Annulla
            </Button>
            <Button type="submit" size="sm" loading={attesa}>
              Crea account
            </Button>
          </div>
        </form>
      ) : elencoAperto ? (
        <div className="space-y-3 border-t border-border pt-3">
          <Field
            label="Nomi"
            htmlFor="elenco-azienda"
            hint="Separati da virgola. Entrano in squadra senza accesso all'app."
          >
            <Textarea
              id="elenco-azienda"
              value={elenco}
              onChange={(e) => setElenco(e.target.value)}
              placeholder="Mario Rossi, Anna Bianchi, Luca Verdi"
              className="min-h-20"
            />
          </Field>
          {nomi.length > 0 ? (
            <p className="text-[12.5px] text-muted">
              {nomi.length} {nomi.length === 1 ? "nome" : "nomi"}. Chi c&apos;&egrave;
              gi&agrave; viene saltato.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setElencoAperto(false)}
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onElenco}
              loading={attesa}
              disabled={nomi.length === 0}
            >
              Aggiungi {nomi.length || ""}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => {
              setPassword(generatePassword());
              setAggiungi(true);
            }}
          >
            <UserPlus className="size-3.5" />
            Un account
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => setElencoAperto(true)}
          >
            <ListPlus className="size-3.5" />
            Elenco di nomi
          </Button>
        </div>
      )}
    </div>
  );
}

function EditDialog({
  company,
  onClose,
  onDone,
}: {
  company: CompanyRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await rinominaAzienda(
        company.id,
        String(formData.get("name")),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Nome aggiornato.");
      onDone();
    });
  }

  function onDelete() {
    startTransition(async () => {
      const result = await eliminaAzienda(company.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Azienda eliminata.");
      onDone();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={company.name}
      description={`${company.people} ${company.people === 1 ? "persona" : "persone"}`}
      footer={
        <>
          {confirmDelete ? (
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
          )}

          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="edit-company" loading={pending}>
            Salva
          </Button>
        </>
      }
    >
      <form id="edit-company" action={onSubmit} className="space-y-4">
        <Field label="Nome dell'azienda" htmlFor="edit-company-name">
          <Input
            id="edit-company-name"
            name="name"
            defaultValue={company.name}
            required
          />
        </Field>

        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger">
          Eliminando l&apos;azienda spariscono anche le sue persone, i loro
          account e tutti i turni. Non si torna indietro.
        </p>
      </form>

      <Persone company={company} onFatto={onDone} />
    </Modal>
  );
}

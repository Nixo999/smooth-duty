"use client";

import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  creaAzienda,
  eliminaAzienda,
  rinominaAzienda,
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { generatePassword } from "@/lib/password";
import type { CompanyRow } from "@/lib/types";

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

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await creaAzienda({
        companyName: String(formData.get("companyName")),
        fullName: String(formData.get("fullName")),
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Azienda creata. Consegna le credenziali al responsabile.");
      onDone();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nuova azienda"
      description="Insieme all'azienda crei l'account del suo responsabile."
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
          <p className="mb-3 text-[11px] uppercase tracking-wide text-faint">
            Responsabile
          </p>
          <div className="space-y-4">
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
        </div>
      </form>
    </Modal>
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
    </Modal>
  );
}

"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { eliminaTurno, salvaTurno } from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { crossesMidnight, durationMinutes, formatDuration, hhmm } from "@/lib/date";
import type { TurnoBozza } from "@/lib/turni-staging";
import type { Department, Profile, Shift } from "@/lib/types";

/** Chi vuole intercettare il salvataggio al posto del server: lo usano la
 *  modalita' Modifica dei Turni e la Supervisione, che accumulano le
 *  modifiche in locale e le applicano solo alla conferma. `id` e' null per
 *  un turno nuovo: l'identificativo provvisorio lo decide il gestore. */
export type GestoreTurni = {
  salva: (
    id: string | null,
    dati: Omit<TurnoBozza, "id">,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  elimina: (
    id: string,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
};

/** Quando si apre la finestra da una cella vuota si conosce gia' giorno e
 *  persona: sono i due campi che l'utente non deve ridigitare. */
export type ShiftDraft = {
  id?: string;
  date: string;
  profile_id: string | null;
  department_id?: string | null;
  start_time?: string;
  end_time?: string;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
};

export function shiftToDraft(s: Shift): ShiftDraft {
  return {
    id: s.id,
    date: s.date,
    profile_id: s.profile_id,
    department_id: s.department_id,
    start_time: hhmm(s.start_time),
    end_time: hhmm(s.end_time),
    title: s.title,
    location: s.location,
    notes: s.notes,
  };
}

export function ShiftDialog({
  draft,
  profiles,
  departments,
  repartoFrequente,
  gestore,
  onClose,
}: {
  draft: ShiftDraft | null;
  profiles: Profile[];
  departments: Department[];
  repartoFrequente: Record<string, string>;
  /** Se c'e', salvataggio ed eliminazione passano da qui, non dal server. */
  gestore?: GestoreTurni;
  onClose: () => void;
}) {
  if (!draft) return null;

  // La chiave cambia a ogni apertura, quindi React rimonta il contenuto con
  // gli orari del turno giusto gia' al primo disegno. Prima lo faceva un
  // effetto che riscriveva lo stato dopo: per un fotogramma si vedevano gli
  // orari del turno aperto in precedenza.
  const chiave = draft.id ?? `nuovo|${draft.date}|${draft.profile_id ?? "-"}`;

  return (
    <Contenuto
      key={chiave}
      draft={draft}
      profiles={profiles}
      departments={departments}
      repartoFrequente={repartoFrequente}
      gestore={gestore}
      onClose={onClose}
    />
  );
}

function Contenuto({
  draft,
  profiles,
  departments,
  repartoFrequente,
  gestore,
  onClose,
}: {
  draft: ShiftDraft;
  profiles: Profile[];
  departments: Department[];
  repartoFrequente: Record<string, string>;
  gestore?: GestoreTurni;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [start, setStart] = React.useState(draft.start_time ?? "09:00");
  const [end, setEnd] = React.useState(draft.end_time ?? "17:00");

  /** Il reparto proposto per una persona: quello in cui lavora piu' spesso,
   *  e in mancanza di storia il suo principale. Chi fa una cosa sola non se
   *  ne accorge nemmeno; a chi ne fa due evita di sceglierlo ogni volta. */
  const proposto = React.useCallback(
    (profileId: string) => {
      if (!profileId) return "";
      const persona = profiles.find((p) => p.id === profileId);
      return repartoFrequente[profileId] ?? persona?.department_id ?? "";
    },
    [profiles, repartoFrequente],
  );

  const [profileId, setProfileId] = React.useState(draft.profile_id ?? "");
  const [departmentId, setDepartmentId] = React.useState(
    draft.department_id ?? proposto(draft.profile_id ?? ""),
  );
  // Una volta che il reparto lo si e' scelto a mano, cambiare persona non lo
  // deve piu' sovrascrivere: e' una decisione, non un valore di comodo.
  const [scelto, setScelto] = React.useState(false);

  const persona = profiles.find((p) => p.id === profileId);
  const suoi = persona?.reparti ?? [];
  const altri = departments.filter((d) => !suoi.includes(d.id));

  const editing = Boolean(draft.id);
  const minutes = durationMinutes(start, end);
  const overnight = crossesMidnight(start, end);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const vuoto = (v: FormDataEntryValue | null) => {
        const testo = String(v ?? "").trim();
        return testo === "" ? null : testo;
      };

      const result = gestore
        ? await gestore.salva(draft.id ?? null, {
            profile_id: profileId === "" ? null : profileId,
            department_id: departmentId === "" ? null : departmentId,
            date: String(formData.get("date")),
            start_time: String(formData.get("start_time")),
            end_time: String(formData.get("end_time")),
            title: vuoto(formData.get("title")),
            location: vuoto(formData.get("location")),
            notes: vuoto(formData.get("notes")),
          })
        : await salvaTurno({
            id: draft.id,
            profile_id: profileId === "" ? null : profileId,
            department_id: departmentId === "" ? null : departmentId,
            date: String(formData.get("date")),
            start_time: String(formData.get("start_time")),
            end_time: String(formData.get("end_time")),
            title: String(formData.get("title") ?? ""),
            location: String(formData.get("location") ?? ""),
            notes: String(formData.get("notes") ?? ""),
          });

      if (!result.ok) {
        toast.error(result.error ?? "Salvataggio non riuscito.");
        return;
      }
      if (!gestore) {
        toast.success(editing ? "Turno aggiornato." : "Turno creato.");
        router.refresh();
      }
      onClose();
    });
  }

  function onDelete() {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const result = gestore
        ? await gestore.elimina(id)
        : await eliminaTurno(id);
      if (!result.ok) {
        toast.error(result.error ?? "Eliminazione non riuscita.");
        return;
      }
      if (!gestore) {
        toast.success("Turno eliminato.");
        router.refresh();
      }
      onClose();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? "Modifica turno" : "Nuovo turno"}
      description={
        minutes > 0
          ? `Durata ${formatDuration(minutes)}${overnight ? " · finisce il giorno dopo" : ""}`
          : undefined
      }
      footer={
        <>
          {editing ? (
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
          <Button type="submit" form="shift-form" loading={pending}>
            Salva
          </Button>
        </>
      }
    >
      <form id="shift-form" action={onSubmit} className="space-y-4">
        <Field label="Chi lavora" htmlFor="profile_id">
          <Select
            id="profile_id"
            name="profile_id"
            value={profileId}
            onChange={(e) => {
              setProfileId(e.target.value);
              if (!scelto) setDepartmentId(proposto(e.target.value));
            }}
          >
            <option value="">— Scoperto —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>

        {departments.length > 0 ? (
          <Field
            label="Reparto"
            htmlFor="department_id"
            hint={
              suoi.length > 1
                ? "Proposto quello in cui lavora pi\u00f9 spesso. Per questo turno puoi cambiarlo."
                : undefined
            }
          >
            <Select
              id="department_id"
              name="department_id"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setScelto(true);
              }}
            >
              <option value="">\u2014 Nessun reparto \u2014</option>
              {suoi.length > 0 ? (
                <optgroup label="Dove lavora">
                  {departments
                    .filter((d) => suoi.includes(d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
              {altri.length > 0 ? (
                <optgroup label={suoi.length > 0 ? "Altri reparti" : "Reparti"}>
                  {altri.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </Select>
          </Field>
        ) : null}

        <Field label="Giorno" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={draft.date} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Inizio" htmlFor="start_time">
            <Input
              id="start_time"
              name="start_time"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field label="Fine" htmlFor="end_time">
            <Input
              id="end_time"
              name="end_time"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Mansione" htmlFor="title" hint="Facoltativo — es. Cassa, Sala, Magazzino">
          <Input
            id="title"
            name="title"
            defaultValue={draft.title ?? ""}
            placeholder="Cassa"
            maxLength={80}
          />
        </Field>

        <Field label="Luogo" htmlFor="location" hint="Facoltativo">
          <Input
            id="location"
            name="location"
            defaultValue={draft.location ?? ""}
            placeholder="Sede centrale"
            maxLength={80}
          />
        </Field>

        <Field label="Note" htmlFor="notes" hint="Facoltativo">
          <Textarea
            id="notes"
            name="notes"
            defaultValue={draft.notes ?? ""}
            placeholder="Indicazioni per la persona in turno"
            maxLength={500}
          />
        </Field>
      </form>
    </Modal>
  );
}

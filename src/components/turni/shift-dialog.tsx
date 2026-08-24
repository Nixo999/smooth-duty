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
import type { Department, Profile, Shift } from "@/lib/types";

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
  onClose,
}: {
  draft: ShiftDraft | null;
  profiles: Profile[];
  departments: Department[];
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
      onClose={onClose}
    />
  );
}

function Contenuto({
  draft,
  profiles,
  departments,
  onClose,
}: {
  draft: ShiftDraft;
  profiles: Profile[];
  departments: Department[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [start, setStart] = React.useState(draft.start_time ?? "09:00");
  const [end, setEnd] = React.useState(draft.end_time ?? "17:00");

  const editing = Boolean(draft.id);
  const minutes = durationMinutes(start, end);
  const overnight = crossesMidnight(start, end);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const profileId = String(formData.get("profile_id") ?? "");
      const departmentId = String(formData.get("department_id") ?? "");
      const result = await salvaTurno({
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
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Turno aggiornato." : "Turno creato.");
      router.refresh();
      onClose();
    });
  }

  function onDelete() {
    if (!draft.id) return;
    const id = draft.id;
    startTransition(async () => {
      const result = await eliminaTurno(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Turno eliminato.");
      router.refresh();
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
            defaultValue={draft.profile_id ?? ""}
          >
            <option value="">— Turno scoperto —</option>
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
            hint="Lascia vuoto per usare il reparto della persona."
          >
            <Select
              id="department_id"
              name="department_id"
              defaultValue={draft.department_id ?? ""}
            >
              <option value="">— Quello della persona —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
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

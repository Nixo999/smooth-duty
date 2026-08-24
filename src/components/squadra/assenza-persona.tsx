"use client";

import { CalendarOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  apriAssenza,
  chiudiAssenza,
  eliminaAssenza,
} from "@/app/(app)/assenze-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CAUSALI, descriviAssenza, NON_RETRIBUITE } from "@/lib/assenze";
import { dayLong, fromISODate, toISODate } from "@/lib/date";
import type { Absence } from "@/lib/types";

/** Assenze di una persona, dal pannello del responsabile.
 *
 *  Il caso normale è quello aperto: chi si ammala non sa quando torna, quindi
 *  la data di fine si lascia vuota e l'assenza vale finché qualcuno conferma
 *  il rientro. */
export function AssenzaPersona({
  profileId,
  inCorso,
  onFatto,
}: {
  profileId: string;
  inCorso: Absence | null;
  onFatto: () => void;
}) {
  const router = useRouter();
  const [attesa, start] = React.useTransition();
  const [apri, setApri] = React.useState(false);
  const [rientro, setRientro] = React.useState(() => toISODate(new Date()));
  const [causale, setCausale] = React.useState("malattia");
  const [conferma, setConferma] = React.useState(false);

  const fatto = (messaggio: string) => {
    toast.success(messaggio);
    router.refresh();
    onFatto();
  };

  function onApri(formData: FormData) {
    const fine = String(formData.get("end_date") ?? "");
    start(async () => {
      const r = await apriAssenza({
        profile_id: profileId,
        type: causale,
        start_date: String(formData.get("start_date")),
        end_date: fine === "" ? null : fine,
        note: String(formData.get("note") ?? "").trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setApri(false);
      fatto("Assenza registrata.");
    });
  }

  function onChiudi() {
    if (!inCorso) return;
    start(async () => {
      const r = await chiudiAssenza({ id: inCorso.id, primo_giorno: rientro });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      fatto("Rientro registrato.");
    });
  }

  function onElimina() {
    if (!inCorso) return;
    start(async () => {
      const r = await eliminaAssenza(inCorso.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      fatto("Assenza eliminata.");
    });
  }

  /* ------------------------------------------------- assenza già aperta -- */

  if (inCorso) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-warning first-letter:uppercase">
              {descriviAssenza(inCorso, (iso) => dayLong(fromISODate(iso)))}
            </p>
            <p className="text-[12.5px] text-warning/80">
              I suoi turni restano visibili ma non contano, così vedi cosa c&apos;è
              da coprire.
            </p>
            {inCorso.note ? (
              <p className="mt-1 text-[12.5px] text-warning/80">{inCorso.note}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setConferma(true)}
            aria-label="Elimina l'assenza"
            title="Elimina: come se non fosse mai stata registrata"
            className="tap grid size-8 shrink-0 place-items-center rounded-full text-warning/70 hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {conferma ? (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-warning">Eliminarla del tutto?</span>
            <Button type="button" variant="danger" size="sm" onClick={onElimina} loading={attesa}>
              Elimina
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConferma(false)}>
              No
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[12.5px] text-warning">
              <span className="mb-1 block">Primo giorno in cui torna</span>
              <Input
                type="date"
                value={rientro}
                onChange={(e) => e.target.value && setRientro(e.target.value)}
                className="h-9 w-40"
              />
            </label>
            <Button type="button" size="sm" onClick={onChiudi} loading={attesa}>
              Registra il rientro
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------ nessuna assenza */

  if (!apri) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">Assenze</p>
          <p className="text-[12.5px] text-muted">
            Malattia, permessi, ferie. La causale la vedi solo tu.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setApri(true)}>
          <CalendarOff className="size-3.5" />
          Registra
        </Button>
      </div>
    );
  }

  return (
    <form
      action={onApri}
      className="mt-4 space-y-3 rounded-xl border border-border bg-surface-2 p-3.5"
    >
      <Field label="Causale" htmlFor="causale">
        <Select
          id="causale"
          value={causale}
          onChange={(e) => setCausale(e.target.value)}
        >
          {CAUSALI.map((gruppo) => (
            <optgroup key={gruppo.gruppo} label={gruppo.gruppo}>
              {gruppo.voci.map(([codice, nome]) => (
                <option key={codice} value={codice}>
                  {nome}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {NON_RETRIBUITE.has(causale) ? (
        <p className="rounded-lg bg-surface-3 px-3 py-2 text-[12.5px] text-muted">
          Nel prospetto queste ore compaiono fra quelle non retribuite. Se poi
          vadano pagate lo dice il contratto, non l&apos;app.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dal" htmlFor="start_date">
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={toISODate(new Date())}
            required
          />
        </Field>
        <Field
          label="Fino al (compreso)"
          htmlFor="end_date"
          hint="Vuoto = ancora in corso."
        >
          <Input id="end_date" name="end_date" type="date" />
        </Field>
      </div>

      <Field label="Nota" htmlFor="note" hint="Facoltativa, la vedi solo tu.">
        <Textarea id="note" name="note" maxLength={300} className="min-h-16" />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setApri(false)}>
          Annulla
        </Button>
        <Button type="submit" size="sm" loading={attesa}>
          Registra
        </Button>
      </div>
    </form>
  );
}

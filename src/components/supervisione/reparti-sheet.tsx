"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  eliminaFascia,
  eliminaReparto,
  salvaFascia,
  salvaReparto,
} from "@/app/(app)/supervisione/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { CoverageBand, Department } from "@/lib/types";
import { cn } from "@/lib/utils";

// Tutte pastello: il colore vero lo compone il foglio di stile, qui si
// sceglie solo la tinta. I gialli fra 50 e 72 si saltano perche' col testo
// scuro sopra diventano illeggibili.
const TINTE = [
  0, 10, 25, 35, 45, 80, 95, 110, 125, 140, 150, 165,
  178, 190, 200, 210, 225, 240, 255, 265, 280, 295, 310, 320, 335, 348,
];
const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];
const GIORNI_LUNGHI = [
  "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica",
];

const hhmm = (t: string) => t.slice(0, 5);

export function RepartiSheet({
  reparti,
  fasce,
  onClose,
}: {
  reparti: Department[];
  fasce: CoverageBand[];
  onClose: () => void;
}) {
  const [nuovo, setNuovo] = React.useState(false);

  return (
    <Modal
      open
      onOpenChange={(a) => !a && onClose()}
      title="Reparti e coperture"
      description="I reparti dividono il tabellone; le fasce dicono quante persone servono e quando."
      className="sm:w-[min(40rem,calc(100vw-2rem))]"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Chiudi
        </Button>
      }
    >
      <div className="space-y-3">
        {reparti.map((r) => (
          <SchedaReparto
            key={r.id}
            reparto={r}
            fasce={fasce.filter((f) => f.department_id === r.id)}
          />
        ))}

        {nuovo ? (
          <FormReparto onFatto={() => setNuovo(false)} onAnnulla={() => setNuovo(false)} />
        ) : (
          <Button variant="secondary" size="sm" block onClick={() => setNuovo(true)}>
            <Plus className="size-4" />
            Nuovo reparto
          </Button>
        )}

        {reparti.length === 0 && !nuovo ? (
          <p className="px-1 text-[12.5px] text-muted">
            Senza reparti la Supervisione non ha niente da raggruppare. Comincia
            da uno: «Cucina», «Sala», «Cassa».
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- reparto */

function SchedaReparto({
  reparto,
  fasce,
}: {
  reparto: Department;
  fasce: CoverageBand[];
}) {
  const [modifica, setModifica] = React.useState(false);
  const [nuovaFascia, setNuovaFascia] = React.useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
      {modifica ? (
        <div className="p-3">
          <FormReparto
            reparto={reparto}
            onFatto={() => setModifica(false)}
            onAnnulla={() => setModifica(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModifica(true)}
          className="tap flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-surface-3"
        >
          <span
            className="pastiglia-reparto rounded-full px-2.5 py-1 text-[12.5px] font-semibold uppercase tracking-wide"
            style={{ ["--tinta" as string]: reparto.hue }}
          >
            {reparto.name}
          </span>
          <span className="ml-auto text-[12px] text-faint">
            {fasce.length} {fasce.length === 1 ? "fascia" : "fasce"} · modifica
          </span>
        </button>
      )}

      <div className="space-y-1.5 border-t border-border px-3 py-2.5">
        {fasce.map((f) => (
          <FormFascia key={f.id} departmentId={reparto.id} fascia={f} />
        ))}

        {nuovaFascia ? (
          <FormFascia
            departmentId={reparto.id}
            posizione={fasce.length}
            onFatto={() => setNuovaFascia(false)}
            onAnnulla={() => setNuovaFascia(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setNuovaFascia(true)}
            className="tap flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong py-2 text-[12.5px] text-muted hover:text-text"
          >
            <Plus className="size-3.5" />
            Aggiungi fascia
          </button>
        )}
      </div>
    </div>
  );
}

function FormReparto({
  reparto,
  onFatto,
  onAnnulla,
}: {
  reparto?: Department;
  onFatto: () => void;
  onAnnulla: () => void;
}) {
  const router = useRouter();
  const [attesa, start] = React.useTransition();
  const [tinta, setTinta] = React.useState(reparto?.hue ?? 210);
  const [conferma, setConferma] = React.useState(false);

  function salva(formData: FormData) {
    start(async () => {
      const r = await salvaReparto({
        id: reparto?.id,
        name: String(formData.get("name") ?? ""),
        hue: tinta,
        position: reparto?.position ?? 99,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(reparto ? "Reparto aggiornato." : "Reparto creato.");
      router.refresh();
      onFatto();
    });
  }

  function elimina() {
    if (!reparto) return;
    start(async () => {
      const r = await eliminaReparto(reparto.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Reparto eliminato.");
      router.refresh();
      onFatto();
    });
  }

  return (
    <form action={salva} className="space-y-2.5">
      <Input
        name="name"
        defaultValue={reparto?.name ?? ""}
        placeholder="Cucina"
        maxLength={40}
        required
        aria-label="Nome del reparto"
      />

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colore">
        {TINTE.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tinta === t}
            aria-label={`Colore ${t}`}
            onClick={() => setTinta(t)}
            className={cn(
              "pastiglia-reparto tap grid size-7 place-items-center rounded-full",
              tinta === t && "ring-2 ring-accent ring-offset-2 ring-offset-surface-2",
            )}
            style={{ ["--tinta" as string]: t }}
          >
            {tinta === t ? <Check className="size-3.5" /> : null}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {reparto ? (
          conferma ? (
            <>
              <span className="text-[12.5px] text-muted">Sicuro?</span>
              <Button type="button" variant="danger" size="sm" onClick={elimina} loading={attesa}>
                Elimina
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConferma(false)}>
                No
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-soft"
              onClick={() => setConferma(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )
        ) : null}

        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onAnnulla}>
          Annulla
        </Button>
        <Button type="submit" size="sm" loading={attesa}>
          Salva
        </Button>
      </div>

      {reparto ? (
        <p className="text-[12px] text-faint">
          Eliminando il reparto spariscono le sue fasce. Le persone e i turni
          restano, semplicemente senza reparto.
        </p>
      ) : null}
    </form>
  );
}

/* ----------------------------------------------------------------- fascia */

function FormFascia({
  departmentId,
  fascia,
  posizione = 0,
  onFatto,
  onAnnulla,
}: {
  departmentId: string;
  fascia?: CoverageBand;
  posizione?: number;
  onFatto?: () => void;
  onAnnulla?: () => void;
}) {
  const router = useRouter();
  const [attesa, start] = React.useTransition();
  const [giorni, setGiorni] = React.useState<number[]>(
    fascia?.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
  );

  function salva(formData: FormData) {
    start(async () => {
      const r = await salvaFascia({
        id: fascia?.id,
        department_id: departmentId,
        name: String(formData.get("name") ?? ""),
        start_time: String(formData.get("start_time") ?? ""),
        end_time: String(formData.get("end_time") ?? ""),
        required: Number(formData.get("required") ?? 1),
        weekdays: giorni,
        position: fascia?.position ?? posizione,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(fascia ? "Fascia aggiornata." : "Fascia creata.");
      router.refresh();
      onFatto?.();
    });
  }

  function elimina() {
    if (!fascia) return;
    start(async () => {
      const r = await eliminaFascia(fascia.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Fascia eliminata.");
      router.refresh();
    });
  }

  return (
    <form
      action={salva}
      className="space-y-2 rounded-lg border border-border bg-surface p-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="name"
          defaultValue={fascia?.name ?? ""}
          placeholder="Mattina"
          maxLength={40}
          required
          aria-label="Nome della fascia"
          className="h-9 min-w-28 flex-1 text-[13px]"
        />
        <Input
          name="start_time"
          type="time"
          defaultValue={fascia ? hhmm(fascia.start_time) : "09:00"}
          required
          aria-label="Dalle"
          className="h-9 w-[6.5rem] text-[13px] cifre"
        />
        <Input
          name="end_time"
          type="time"
          defaultValue={fascia ? hhmm(fascia.end_time) : "15:00"}
          required
          aria-label="Alle"
          className="h-9 w-[6.5rem] text-[13px] cifre"
        />
        <div className="flex items-center gap-1">
          <Input
            name="required"
            type="number"
            min={1}
            max={99}
            defaultValue={fascia?.required ?? 1}
            required
            aria-label="Persone necessarie"
            className="h-9 w-16 text-[13px]"
          />
          <span className="text-[12px] text-muted">persone</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-faint">Giorni</span>
        {GIORNI.map((lettera, i) => {
          const iso = i + 1;
          const attivo = giorni.includes(iso);
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={attivo}
              aria-label={GIORNI_LUNGHI[i]}
              title={GIORNI_LUNGHI[i]}
              onClick={() =>
                setGiorni((g) =>
                  g.includes(iso) ? g.filter((x) => x !== iso) : [...g, iso].sort(),
                )
              }
              className={cn(
                "tap grid size-7 place-items-center rounded-full text-[12px] font-medium",
                attivo
                  ? "bg-accent text-accent-fg"
                  : "bg-surface-3 text-faint hover:text-muted",
              )}
            >
              {lettera}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {fascia ? (
            <button
              type="button"
              onClick={elimina}
              aria-label="Elimina fascia"
              className="tap grid size-8 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
          {onAnnulla ? (
            <Button type="button" variant="ghost" size="sm" onClick={onAnnulla}>
              Annulla
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={attesa}>
            Salva
          </Button>
        </div>
      </div>
    </form>
  );
}

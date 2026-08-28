"use client";

import { ArrowDown } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  anteprimaCopia,
  copiaTurni,
  type Anteprima,
} from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dayLong, fromISODate, weekLabel } from "@/lib/date";
import { addDays, mondayOf } from "@/lib/week";
import { cn } from "@/lib/utils";

type Modo = "settimana" | "giorno";

/** Copia turni da un periodo a un altro.
 *
 *  Prima era un bottone solo, "copia la settimana precedente": comodo una
 *  volta su due e inutile tutte le altre. Le impostazioni di partenza fanno
 *  ancora quella cosa li' in un clic, ma origine e destinazione ora si
 *  scelgono. */
export function CopiaDialog({
  monday,
  giorno,
  onCopiato,
  onClose,
}: {
  monday: string;
  giorno: string;
  /** La copia cambia i turni senza passare dalla storia di annulla/ripeti:
   *  chi quella storia la tiene deve saperlo, o la freccia indietro
   *  prometterebbe di riportare un tabellone che non c'e' piu'. */
  onCopiato: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [modo, setModo] = React.useState<Modo>("settimana");
  const [da, setDa] = React.useState(() => addDays(monday, -7));
  const [a, setA] = React.useState(monday);
  const [sovrascrivi, setSovrascrivi] = React.useState(true);

  const [anteprima, setAnteprima] = React.useState<{
    chiave: string;
    dati: Anteprima;
  } | null>(null);
  const [contando, startConteggio] = React.useTransition();
  const [copiando, startCopia] = React.useTransition();

  // Cambiando modalità le date di partenza non hanno più senso: una
  // settimana intera e un singolo giorno si scelgono in modo diverso.
  function cambiaModo(nuovo: Modo) {
    if (nuovo === modo) return;
    setModo(nuovo);
    if (nuovo === "settimana") {
      setDa(addDays(monday, -7));
      setA(monday);
    } else {
      setDa(addDays(giorno, -7));
      setA(giorno);
    }
  }

  // I numeri li conta il server: sono turni che potrebbero stare in settimane
  // che questa pagina non ha caricato.
  //
  // Il risultato porta con se' la richiesta a cui risponde. Cambiando data in
  // fretta le risposte possono tornare in ordine sparso, e senza questo
  // confronto si vedrebbero i conteggi di una scelta precedente.
  const chiave = `${modo}|${da}|${a}`;

  React.useEffect(() => {
    let annullato = false;
    startConteggio(async () => {
      const r = await anteprimaCopia({ modo, da, a, sovrascrivi: false });
      if (!annullato && r.ok) setAnteprima({ chiave, dati: r.dati });
    });
    return () => {
      annullato = true;
    };
  }, [chiave, modo, da, a]);

  const dati = anteprima?.chiave === chiave ? anteprima.dati : null;

  const stessoPeriodo =
    modo === "settimana" ? mondayOf(da) === mondayOf(a) : da === a;

  const etichetta = (iso: string) =>
    modo === "settimana"
      ? weekLabel(fromISODate(mondayOf(iso)))
      : dayLong(fromISODate(iso));

  const conteggio = (n: number | undefined) => {
    if (contando || n === undefined) return "…";
    if (n === 0) return modo === "settimana" ? "settimana vuota" : "nessun turno";
    return `${n} ${n === 1 ? "turno" : "turni"}`;
  };

  const origine = dati?.origine;
  const destinazione = dati?.destinazione;

  function copia() {
    startCopia(async () => {
      const r = await copiaTurni({ modo, da, a, sovrascrivi });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const copiati = `${r.copiati} turni copiati${r.sostituiti > 0 ? `, ${r.sostituiti} sostituiti` : ""}`;
      // I saltati si dicono, e si dicono forte: sono turni che il
      // responsabile crede di avere e non ha, perche' chi e' a chiamata quel
      // giorno non e' disponibile.
      if (r.saltati > 0) {
        toast.warning(
          `${copiati}. ${r.saltati} ${r.saltati === 1 ? "turno lasciato" : "turni lasciati"} indietro: chi e' a chiamata in quei giorni non e' disponibile.`,
        );
      } else {
        toast.success(`${copiati}.`);
      }
      onCopiato();
      router.push(`/turni?s=${mondayOf(r.vaiA)}`, { scroll: false });
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(aperto) => !aperto && onClose()}
      title="Copia turni"
      description="Scegli cosa copiare e dove incollarlo."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button
            type="button"
            onClick={copia}
            loading={copiando}
            disabled={stessoPeriodo || origine === 0 || origine === undefined}
          >
            {origine ? `Copia ${origine} turni` : "Copia"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          role="radiogroup"
          aria-label="Cosa copiare"
          className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
        >
          {(
            [
              ["settimana", "Settimana intera"],
              ["giorno", "Un solo giorno"],
            ] as const
          ).map(([valore, testo]) => (
            <button
              key={valore}
              type="button"
              role="radio"
              aria-checked={modo === valore}
              onClick={() => cambiaModo(valore)}
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

        <Riquadro
          etichetta="Copia da"
          valore={da}
          onChange={setDa}
          descrizione={etichetta(da)}
          conteggio={conteggio(origine)}
          vuoto={origine === 0}
        />

        <div className="flex justify-center">
          <div className="grid size-7 place-items-center rounded-full bg-surface-3 text-muted">
            <ArrowDown className="size-3.5" />
          </div>
        </div>

        <Riquadro
          etichetta="Incolla su"
          valore={a}
          onChange={setA}
          descrizione={etichetta(a)}
          conteggio={conteggio(destinazione)}
        />

        {stessoPeriodo ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
            Origine e destinazione sono la stessa cosa: scegline un&apos;altra.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
          <input
            type="checkbox"
            checked={sovrascrivi}
            onChange={(e) => setSovrascrivi(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">
              Sostituisci quello che c&apos;è già
            </span>
            <span className="block text-[12.5px] text-muted">
              {destinazione
                ? sovrascrivi
                  ? `${destinazione} ${destinazione === 1 ? "turno verrà eliminato" : "turni verranno eliminati"} prima di incollare.`
                  : `Ci sono già ${destinazione} turni: i nuovi si aggiungeranno a quelli.`
                : "La destinazione è vuota, non c'è niente da sostituire."}
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

function Riquadro({
  etichetta,
  valore,
  onChange,
  descrizione,
  conteggio,
  vuoto,
}: {
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  descrizione: string;
  conteggio: string;
  vuoto?: boolean;
}) {
  const id = `copia-${etichetta.replace(/\s/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
      <Field label={etichetta} htmlFor={id}>
        <Input
          id={id}
          type="date"
          value={valore}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </Field>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className="font-medium capitalize">{descrizione}</span>
        <span className={cn("text-[12.5px]", vuoto ? "text-warning" : "text-muted")}>
          {conteggio}
        </span>
      </p>
    </div>
  );
}

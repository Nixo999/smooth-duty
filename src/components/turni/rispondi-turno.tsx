"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { accettaTurno, rifiutaTurno } from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

/** Il sì e il no del dipendente su un turno preapprovato.
 *
 *  Il turno vale già: chi non dice niente ha accettato, ed è il caso di gran
 *  lunga più frequente. I due bottoni servono a chi vuole dirlo — «va bene»
 *  toglie il responsabile dal dubbio, «non posso» gli manda un messaggio —
 *  e sono l'uno accanto all'altro perché sono la stessa domanda, non due
 *  cose diverse.
 *
 *  Il no chiede una riga di motivo: facoltativa, ma è quella che il
 *  responsabile legge per capire come rimediare. */
export function RispondiTurno({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [aperto, setAperto] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [pending, start] = React.useTransition();
  /** Quale dei due si sta usando: senza, il «sì» accenderebbe anche lo
   *  spinner del «no» e viceversa. */
  const [inCorso, setInCorso] = React.useState<"si" | "no" | null>(null);

  /** Chiudere senza rifiutare azzera anche quello che si stava scrivendo:
   *  chi ci ripensa e riapre non deve ritrovarsi il motivo di prima già
   *  scritto, e magari mandarlo senza rileggerlo. */
  const chiudi = () => {
    setAperto(false);
    setNota("");
  };

  const accetta = () =>
    start(async () => {
      setInCorso("si");
      const esito = await accettaTurno(turnoId);
      setInCorso(null);
      if (!esito.ok) {
        toast.error(esito.error);
        router.refresh();
        return;
      }
      toast.success("Turno accettato.");
      router.refresh();
    });

  const rifiuta = () =>
    start(async () => {
      setInCorso("no");
      const esito = await rifiutaTurno(turnoId, nota);
      setInCorso(null);
      if (!esito.ok) {
        toast.error(esito.error);
        // Il turno non è più quello che aveva davanti: si ricarica, così
        // vede subito com'è adesso invece di riprovare sul vecchio.
        router.refresh();
        return;
      }
      chiudi();
      toast.success("Rifiuto inviato: il responsabile è stato avvisato.");
      router.refresh();
    });

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          onClick={accetta}
          loading={pending && inCorso === "si"}
          disabled={pending}
        >
          <Check className="size-3.5" />
          Va bene
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAperto(true)}
          disabled={pending}
        >
          <X className="size-3.5" />
          Non posso
        </Button>
      </div>

      {aperto ? (
        <Modal
          open
          onOpenChange={(v) => !v && chiudi()}
          title="Rifiutare questo turno"
          description="Il responsabile riceve un messaggio. Se il turno era una modifica di uno che avevi già, torna com'era."
          footer={
            <>
              <Button type="button" variant="secondary" onClick={chiudi}>
                Lascia stare
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={rifiuta}
                loading={pending && inCorso === "no"}
              >
                Rifiuta il turno
              </Button>
            </>
          }
        >
          <Field
            label="Perché non puoi"
            htmlFor="nota-rifiuto"
            hint="Facoltativo, ma aiuta il responsabile a rimediare."
          >
            <Textarea
              id="nota-rifiuto"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ho un impegno preso, quel giorno non riesco"
              maxLength={300}
            />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

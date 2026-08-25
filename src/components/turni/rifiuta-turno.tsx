"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { rifiutaTurno } from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

/** Il no del dipendente su un turno preapprovato.
 *
 *  Il turno vale gia': chi non dice niente ha accettato, ed e' il caso di
 *  gran lunga piu' frequente. Questo bottone serve all'altro, e chiede una
 *  riga di motivo — facoltativa, ma e' quella che il responsabile legge per
 *  capire come rimediare. */
export function RifiutaTurno({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [aperto, setAperto] = React.useState(false);
  const [nota, setNota] = React.useState("");
  const [pending, start] = React.useTransition();

  /** Chiudere senza rifiutare azzera anche quello che si stava scrivendo:
   *  chi ci ripensa e riapre non deve ritrovarsi il motivo di prima gia'
   *  scritto, e magari mandarlo senza rileggerlo. */
  const chiudi = () => {
    setAperto(false);
    setNota("");
  };

  const rifiuta = () =>
    start(async () => {
      const esito = await rifiutaTurno(turnoId, nota);
      if (!esito.ok) {
        toast.error(esito.error);
        // Il turno non e' piu' quello che aveva davanti: si ricarica, cosi'
        // vede subito com'e' adesso invece di riprovare sul vecchio.
        router.refresh();
        return;
      }
      chiudi();
      toast.success("Rifiuto inviato: il responsabile è stato avvisato.");
      router.refresh();
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAperto(true)}>
        <X className="size-3.5" />
        Non posso
      </Button>

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
              <Button type="button" variant="danger" onClick={rifiuta} loading={pending}>
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

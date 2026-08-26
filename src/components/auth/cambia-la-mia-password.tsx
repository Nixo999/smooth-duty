"use client";

import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { cambiaLaMiaPassword, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

const iniziale: FormState = {};

/** Lo apre il menu del proprio nome, ma vive fuori da quel menu: montato
 *  dentro, si smonterebbe insieme alla tendina nell'istante stesso in cui la
 *  voce viene scelta. Si monta solo da aperto, così ogni volta riparte
 *  pulito — campi vuoti e nessun errore vecchio. */
export function PannelloCambiaPassword({
  aperto,
  onClose,
}: {
  aperto: boolean;
  onClose: () => void;
}) {
  if (!aperto) return null;
  return <Pannello onClose={onClose} />;
}

function Pannello({ onClose }: { onClose: () => void }) {
  const [stato, azione, inCorso] = useActionState(cambiaLaMiaPassword, iniziale);

  // La conferma la dà un avviso, non una riga verde dentro un pannello che
  // sta per chiudersi: quella non farebbe in tempo a leggerla nessuno.
  React.useEffect(() => {
    if (!stato.ok) return;
    toast.success("Password cambiata. La prossima volta entra con quella nuova.");
    onClose();
  }, [stato.ok, onClose]);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cambia password"
      description="Vale da subito, anche sugli altri dispositivi."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="cambia-la-mia-password" loading={inCorso}>
            Salva
          </Button>
        </>
      }
    >
      <form id="cambia-la-mia-password" action={azione} className="space-y-4">
        <Field
          label="Password di adesso"
          htmlFor="attuale"
          hint="Serve a essere sicuri che sia tu."
        >
          <Input
            id="attuale"
            name="attuale"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Field label="Nuova password" htmlFor="nuova" hint="Almeno 10 caratteri.">
          <Input
            id="nuova"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        <Field label="Ripetila" htmlFor="conferma">
          <Input
            id="conferma"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        {stato.error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {stato.error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

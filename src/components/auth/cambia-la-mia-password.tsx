"use client";

import { KeyRound } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { cambiaLaMiaPassword, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

const iniziale: FormState = {};

/** La voce nel menu del proprio nome. Il pannello si monta solo da aperto,
 *  così ogni volta riparte pulito: i campi vuoti e nessun errore vecchio. */
export function CambiaLaMiaPassword() {
  const [aperto, setAperto] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="tap flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted hover:bg-surface-3 hover:text-text"
      >
        <KeyRound className="size-3.5" />
        Cambia password
      </button>

      {aperto ? <Pannello onClose={() => setAperto(false)} /> : null}
    </>
  );
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

        <Field label="Nuova password" htmlFor="nuova" hint="Almeno 8 caratteri.">
          <Input
            id="nuova"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        <Field label="Ripetila" htmlFor="conferma">
          <Input
            id="conferma"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
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

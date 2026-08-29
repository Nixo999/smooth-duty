"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";
import { chiediRecuperoPassword, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const initial: FormState = {};

export function RecuperoForm() {
  const [state, action, pending] = useActionState(chiediRecuperoPassword, initial);

  /* A cose fatte il modulo sparisce. Lasciarlo sotto la conferma invita a
   * premere di nuovo — e ogni pressione e' un'altra email a qualcuno. */
  if (state.ok) {
    return (
      <div className="mt-6 space-y-3">
        <div className="flex items-start gap-2.5 rounded-xl bg-success-soft px-4 py-3.5 text-success">
          <MailCheck className="mt-0.5 size-4 shrink-0" />
          <div className="text-[13.5px]">
            <p className="font-medium">Se quell&apos;indirizzo è di un account, la mail è partita.</p>
            {/* Senza opacity: e' la riga che dice cosa fare adesso. Quella
                sopra si stacca gia' col grassetto. */}
            <p className="mt-1">
              Apri il link che trovi dentro e scegli la password nuova. Se non
              arriva entro qualche minuto guarda nella posta indesiderata.
            </p>
          </div>
        </div>
        <p className="text-center text-[12.5px] text-faint">
          Il link vale una volta sola e scade: se lo apri troppo tardi, richiedilo.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field
        label="Email"
        htmlFor="email"
        hint="Lo stesso indirizzo con cui entri nell'app."
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nome@azienda.it"
          required
        />
      </Field>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" block loading={pending}>
        Mandami il link
      </Button>
    </form>
  );
}

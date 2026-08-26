"use client";

import { useActionState } from "react";
import { cambiaPassword, type FormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const initial: FormState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(cambiaPassword, initial);

  return (
    <form action={action} className="mt-6 space-y-4">
      <Field label="Nuova password" htmlFor="password" hint="Almeno 10 caratteri. Una frase che ricordi vale più di simboli a caso.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Field label="Ripetila" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
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
        Salva e continua
      </Button>
    </form>
  );
}

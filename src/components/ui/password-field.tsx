"use client";

import { Copy, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { generatePassword } from "@/lib/password";

/** Password provvisoria: si genera, si copia, si consegna. Chi la riceve
 *  dovra' cambiarla al primo accesso. */
export function PasswordField({
  name = "password",
  id = "password",
  value,
  onChange,
  label = "Password provvisoria",
  hint = "Consegnala alla persona: le verrà chiesto di cambiarla al primo accesso.",
}: {
  name?: string;
  id?: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={8}
          required
          className="font-mono"
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Genera un'altra password"
          onClick={() => onChange(generatePassword())}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Copia la password"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success("Password copiata.");
            } catch {
              // Senza permesso per gli appunti resta comunque leggibile.
              toast.error("Copia non riuscita: selezionala a mano.");
            }
          }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </Field>
  );
}

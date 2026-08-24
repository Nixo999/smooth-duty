"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { confermaRientro } from "@/app/(app)/assenze-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toISODate } from "@/lib/date";

/** «Finché lui non conferma che torna»: è questo bottone.
 *
 *  Si chiede il primo giorno in cui torna, non l'ultimo di assenza: è la
 *  domanda che la persona sa rispondere («da lunedì ci sono»), e l'app fa da
 *  sé il conto all'indietro. */
export function ConfermaRientro() {
  const router = useRouter();
  const [aperto, setAperto] = React.useState(false);
  const [giorno, setGiorno] = React.useState(() => toISODate(new Date()));
  const [attesa, start] = React.useTransition();

  function conferma() {
    start(async () => {
      const r = await confermaRientro(giorno);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rientro confermato.");
      setAperto(false);
      router.refresh();
    });
  }

  if (!aperto) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setAperto(true)}>
        <CheckCircle2 className="size-3.5" />
        Confermo il rientro
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[12.5px] text-muted">
        <span className="mb-1 block">Primo giorno in cui torni</span>
        <Input
          type="date"
          value={giorno}
          onChange={(e) => e.target.value && setGiorno(e.target.value)}
          className="h-9 w-40"
        />
      </label>
      <Button size="sm" onClick={conferma} loading={attesa}>
        Conferma
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAperto(false)}>
        Annulla
      </Button>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { confermaTurno } from "@/app/(app)/turni/actions";
import { Button } from "@/components/ui/button";

/** Il si' del dipendente su un turno che lo richiede. Vive in un componente
 *  suo perche' la settimana del dipendente e' resa dal server: il bottone e'
 *  l'unico pezzo che ha bisogno di stare nel browser. */
export function ConfermaTurno({ turnoId }: { turnoId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <Button
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const esito = await confermaTurno(turnoId);
          if (!esito.ok) {
            toast.error(esito.error);
            return;
          }
          toast.success("Turno confermato.");
          router.refresh();
        })
      }
    >
      <Check className="size-3.5" />
      Accetta
    </Button>
  );
}

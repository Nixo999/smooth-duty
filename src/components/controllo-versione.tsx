"use client";

import * as React from "react";
import { CaricamentoMarchio } from "@/components/ui/caricamento-marchio";

/** La versione con cui questo bundle è stato costruito. Inline alla build:
 *  ogni deploy ne stampa una diversa, e un'app aperta da prima se la porta
 *  dietro finché non si ricarica. */
const VERSIONE = process.env.NEXT_PUBLIC_VERSIONE;

/** Se là fuori c'è una versione più nuova, l'app si ricarica da sola.
 *
 *  Senza, chi tiene l'app installata sul telefono resta sulla versione del
 *  giorno in cui l'ha aperta: i pezzi nuovi arrivano solo quando gli va di
 *  chiudere e riaprire, e nel frattempo un bundle vecchio può chiedere al
 *  server cose che non esistono più. Il controllo gira quando l'app torna
 *  in primo piano — il momento tipico in cui è rimasta aperta da ieri — e
 *  ogni cinque minuti.
 *
 *  Il giro infinito è l'unico guasto serio possibile qui: se dopo la
 *  ricarica la versione remota risultasse ancora diversa (una cache che
 *  mente), senza memoria si ricaricherebbe per sempre. Per questo ogni
 *  versione si tenta una volta sola per sessione. */
export function ControlloVersione() {
  const [nuova, setNuova] = React.useState(false);

  React.useEffect(() => {
    if (!VERSIONE || process.env.NODE_ENV !== "production") return;
    let smontato = false;

    const controlla = async () => {
      try {
        const risposta = await fetch("/versione", { cache: "no-store" });
        if (!risposta.ok) return;
        const remota = (await risposta.text()).trim();
        if (smontato || !remota || remota === VERSIONE) return;

        const chiave = "denkishift-versione-provata";
        try {
          if (sessionStorage.getItem(chiave) === remota) return;
          sessionStorage.setItem(chiave, remota);
        } catch {
          // Navigazione privata senza storage: meglio rischiare un giro in
          // piu' che non aggiornarsi mai.
        }

        setNuova(true);
        // Un respiro perche' il marchio compaia davvero prima del salto:
        // una ricarica a schermo ancora vecchio sembra un guasto.
        setTimeout(() => window.location.reload(), 700);
      } catch {
        // Niente rete: se ne riparla al prossimo giro.
      }
    };

    const alRitorno = () => {
      if (document.visibilityState === "visible") controlla();
    };
    const giro = setInterval(controlla, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      smontato = true;
      clearInterval(giro);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, []);

  return nuova ? (
    <CaricamentoMarchio messaggio="C'è una versione nuova: la apro." />
  ) : null;
}

import * as React from "react";
import { cn } from "@/lib/utils";

/** Il recinto attorno ai comandi che cambiano il tabellone: annulla,
 *  ripeti, modifica, pubblica, svuota.
 *
 *  Nella barra degli strumenti stanno accanto a filtri e ricerca, che il
 *  tabellone lo guardano soltanto. Senza un contorno sembravano la stessa
 *  cosa, e la differenza fra «filtra» e «cancella tutto» non e' una
 *  sfumatura. Lo usano i Turni e la Supervisione: uno solo, cosi' i due
 *  gruppi non prendono strade diverse. */
export function GruppoModifica({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // I 36px dei controlli piu' i due bordi e il pizzico d'aria: la
      // scatola resta alta come i campi che le stanno accanto.
      className={cn(
        "flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-2 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

import { Marchio } from "@/components/ui/marchio";

/** L'attesa con la faccia dell'app: il marchio che gira su tutto lo schermo.
 *
 *  Lo usano i due momenti in cui l'app si ricarica per intero — il
 *  trascinamento in giù del tabellone e l'arrivo di una versione nuova — e
 *  per questo copre tutto, intestazione compresa: sotto sta succedendo un
 *  ricaricamento vero, e lasciare cliccabile quello che sta per sparire
 *  sarebbe una promessa non mantenuta.
 *
 *  Chi ha chiesto meno movimento non riceve il giro: il marchio pulsa
 *  appena, che dice «sto lavorando» senza girare. */
export function CaricamentoMarchio({ messaggio }: { messaggio?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] grid place-items-center bg-canvas"
    >
      <div className="flex flex-col items-center gap-4">
        <Marchio className="size-16 animate-girata text-text motion-reduce:animate-[skeleton-pulse_1.6s_ease-in-out_infinite]" />
        <p className="text-[13px] text-muted">{messaggio ?? "Un attimo…"}</p>
      </div>
    </div>
  );
}

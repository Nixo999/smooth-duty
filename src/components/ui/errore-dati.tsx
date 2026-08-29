import { DatabaseZap } from "lucide-react";
import { serveAggiornamento } from "@/lib/errori";

/** Quando una lettura dal database non riesce.
 *
 *  Esiste per un motivo preciso, ed è il peggior spavento che questa app
 *  abbia mai fatto prendere a qualcuno: le pagine leggevano i dati con
 *  `data ?? []`, e un errore diventava un elenco vuoto. Un tabellone senza
 *  turni è indistinguibile da un tabellone cancellato — solo che nel primo
 *  caso i turni sono tutti lì, e a non funzionare è la domanda.
 *
 *  Succede tipicamente dopo un aggiornamento dell'app quando le migrazioni
 *  SQL non sono state eseguite: il codice chiede colonne che nel database
 *  ancora non esistono, e Postgres rifiuta l'intera interrogazione. */
export function ErroreDati({
  cosa,
  dettaglio,
}: {
  /** Che cosa non si è riusciti a leggere: «i turni», «le persone». */
  cosa: string;
  /** Il messaggio tecnico del guasto. **Non si mostra**: serve a capire di
   *  che specie di guasto si tratta, e finisce nel registro del server, dove
   *  lo legge chi può rimediare. A schermo diceva cose come «column
   *  company_settings.regime_chiamata does not exist», che a chi sta
   *  guardando i turni non serve a niente e lo convince di aver rotto
   *  qualcosa lui. */
  dettaglio?: string;
}) {
  const mancaUnPezzo = serveAggiornamento(dettaglio);

  // L'unica diagnosi che questa app sa fare da sola non va persa: si sposta
  // dallo schermo al registro del server.
  if (dettaglio) console.error(`[dati] lettura di ${cosa} fallita:`, dettaglio);

  return (
    <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-danger/40 bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
          <DatabaseZap className="size-4" />
        </span>
        <div>
          <p className="text-[15px] font-semibold">
            Non si riesce a leggere {cosa}
          </p>
          <p className="text-[13px] text-muted">
            Non è successo niente ai tuoi dati: sono tutti al loro posto, è la
            domanda che non arriva a destinazione. Ricarica la pagina fra un
            minuto.
          </p>
        </div>
      </div>

      {mancaUnPezzo ? (
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13.5px]">
          <p className="font-medium">Manca un pezzo dell&apos;installazione.</p>
          <p className="mt-1 text-muted">
            L&apos;app chiede un dato che su questo account non è ancora stato
            attivato, e da qui non si sistema. Segnalalo a chi ti ha installato
            l&apos;app: è questione di minuti, e i turni tornano tutti
            com&apos;erano.
          </p>
        </div>
      ) : null}
    </div>
  );
}

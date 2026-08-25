import { DatabaseZap } from "lucide-react";

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
  /** Il messaggio del database, per chi lo sa leggere. */
  dettaglio?: string;
}) {
  const colonnaMancante = /column .* does not exist/i.test(dettaglio ?? "");

  return (
    <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border border-danger/40 bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
          <DatabaseZap className="size-4" />
        </span>
        <div>
          <p className="text-[15px] font-semibold">
            Non riesco a leggere {cosa}
          </p>
          <p className="text-[13px] text-muted">
            Non è successo niente ai tuoi dati: sono nel database, è la
            lettura che non va a buon fine.
          </p>
        </div>
      </div>

      {colonnaMancante ? (
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13.5px]">
          <p className="font-medium">Manca un aggiornamento del database.</p>
          <p className="mt-1 text-muted">
            L&apos;app chiede una colonna che nel database non c&apos;è ancora.
            Apri Supabase, vai in <strong>SQL Editor</strong> ed esegui in
            ordine di numero i file della cartella <code>supabase/</code> che
            non hai ancora lanciato. Poi ricarica questa pagina: i turni
            torneranno tutti.
          </p>
        </div>
      ) : null}

      {dettaglio ? (
        <p className="rounded-lg bg-surface-3 px-3 py-2 font-mono text-[12px] text-muted">
          {dettaglio}
        </p>
      ) : null}
    </div>
  );
}

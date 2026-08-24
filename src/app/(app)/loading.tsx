/** Quello che si vede nell'attimo fra il click e la risposta del server.
 *
 *  Prima di questo file non si vedeva niente: si premeva una voce del menu e
 *  la pagina vecchia restava li' finche' il server non aveva finito, che
 *  sulla rete del telefono vuol dire secondi a fissare uno schermo fermo.
 *  Con un confine di Suspense la navigazione scatta subito e l'attesa
 *  succede *dentro* la pagina nuova, dove si vede che sta arrivando.
 *
 *  E' volutamente generico — una riga di comandi e una lista — perche' copre
 *  tutte le pagine del gruppo: turni, supervisione, prospetto e squadra
 *  hanno tutte quella forma. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Caricamento" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="skeleton h-9 w-44" />
        <div className="skeleton h-9 w-32" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border bg-surface-2 px-4 py-3">
          <div className="skeleton h-4 w-40" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
          >
            <div className="skeleton size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-3.5 w-1/3" />
              <div className="skeleton h-3 w-1/2 opacity-70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stessa idea del gruppo (app): la navigazione scatta subito, l'attesa si
 *  vede dentro la pagina. Vedi src/app/(app)/loading.tsx per il perche'. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Caricamento" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="skeleton h-9 w-44" />
        <div className="skeleton h-9 w-32" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-b-0"
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

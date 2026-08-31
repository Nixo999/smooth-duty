import { Marchio } from "@/components/ui/marchio";

/** Quello che si vede nell'attimo fra il click e la risposta del server.
 *
 *  Prima di questo file non si vedeva niente: si premeva una voce del menu e
 *  la pagina vecchia restava li' finche' il server non aveva finito, che
 *  sulla rete del telefono vuol dire secondi a fissare uno schermo fermo.
 *  Con un confine di Suspense la navigazione scatta subito e l'attesa
 *  succede *dentro* la pagina nuova, dove si vede che sta arrivando.
 *
 *  Era uno scheletro con la forma della pagina; dal 31 agosto 2026 e' il
 *  marchio al centro, col calendario fermo e l'anello che gira (richiesta di
 *  Nicola): un'attesa sola, con la faccia dell'app, uguale ovunque. Copre
 *  anche il primo arrivo — la shell arriva subito e questo gira finche' la
 *  pagina non e' pronta.
 *
 *  Il minimo d'altezza serve a mettere il marchio all'altezza dello sguardo:
 *  senza, il grid si schiaccia in cima sotto l'intestazione. */
export default function Loading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Caricamento"
      className="grid min-h-[55dvh] place-items-center"
    >
      <Marchio className="marchio-girante size-16 text-text motion-reduce:animate-[skeleton-pulse_1.6s_ease-in-out_infinite]" />
    </div>
  );
}

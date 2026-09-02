import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** La barra che compare in fondo quando hai selezionato qualcosa — le
 *  caselle di Disponibilita' a tabellone, i giorni della propria
 *  disponibilita'.
 *
 *  Sta scritta qui una volta sola perche' le due barre sono la stessa cosa
 *  vista dai due lati, e i due errori che ha gia' fatto erano in tutte e due.
 *
 *  Non e' piu' `fixed`: sta **dentro** l'area che scorre, appiccicata al suo
 *  bordo basso. La barra di navigazione, sotto i 640px, sta nel flusso sotto
 *  quell'area (`app-shell.tsx`) e si prende lo spazio da sola: cosi' nessuna
 *  delle due deve sapere quanto e' alta l'altra, e lo spazio che il contenuto
 *  lascia in fondo e' la barra stessa, non un numero da tenere allineato.
 *  `fixed` era costata due volte: con `bottom-0` copriva la navigazione, e
 *  alzata di 53px — altezza copiata da un commento, mai misurata — copriva
 *  le ultime righe del contenuto.
 *
 *  `-mx-4 px-4` la porta ai bordi restando dentro il contenitore che ha i
 *  suoi margini. Da 640px in su la navigazione non c'e', l'area che scorre
 *  arriva al bordo dello schermo e la barra si prende lei la cornice del
 *  telefono. */
export const BARRA_AZIONI =
  "sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface/95 px-4 py-3 " +
  "shadow-float backdrop-blur sm:-mx-6 " +
  "sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]";

/** La tendina di Radix (`DropdownMenu.Content`), uguale in tutta l'app.
 *
 *  Stava scritta a mano in cinque posti, identica salvo la larghezza, e
 *  aggiungerle l'animazione di chiusura e' costato cinque modifiche: lo
 *  stesso ritocco sul modale ne e' costata una, perche' `ui/modal.tsx` lo
 *  avvolge una volta sola. L'animazione e' legata allo stato: Radix tiene il
 *  nodo montato finche' quella di chiusura non finisce. */
export const TENDINA =
  "z-40 rounded-xl border border-border bg-surface p-1.5 shadow-float " +
  "data-[state=open]:animate-pop data-[state=closed]:animate-pop-out";

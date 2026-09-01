"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  type Asse,
  type Verso,
  QUOTA_PER_COMPLETARE,
  asseDelGesto,
  daCompletare,
  destinazione,
  indiceAttivo,
  nellaZonaDiSistema,
  scostamento,
} from "@/lib/scorrimento";

/** Si passa da una pagina all'altra **trascinando il dito**, come fra le
 *  schermate della home di un telefono: il foglio segue il dito, e al
 *  rilascio o completa il passaggio o torna al suo posto.
 *
 *  Le pagine sono quelle della barra, nel loro ordine: il dito e il dito che
 *  preme il pulsante portano sempre nello stesso posto. Fuori dalla barra —
 *  `/turni/importa`, `/squadra`, `/impostazioni` — il gesto non esiste.
 *
 *  La decisione (soglie, verso, resistenza) sta in `lib/scorrimento.ts` e si
 *  prova senza browser. Qui c'e' solo il DOM: chi possiede il gesto, dove va
 *  a finire il foglio, e cosa si accende nella barra mentre il dito e' giu'.
 *
 *  ⚠️ **Non e' il gesto di OperO trapiantato.** Li' la navigazione e' un
 *  cambio di componente e il passaggio si disegna con una View Transition;
 *  qui ogni pagina e' un giro fino al server, quindi l'uscita e l'ingresso
 *  sono due momenti separati e l'ingresso puo' toccare al segnaposto di
 *  `loading.tsx`. Provare a fingere che siano un movimento solo darebbe uno
 *  scatto ogni volta che la rete e' lenta. */

/** Quello che si accende nella barra mentre il dito e' ancora giu'. */
export type Anteprima = {
  percorso: string;
  /** Vero quando il dito ha gia' passato la soglia: mollando adesso si
   *  arriva. E' la differenza fra «stai andando li'» e «ci sei». */
  sicura: boolean;
};

/** Rete di sicurezza: se la navigazione non arriva mai, il foglio torna al
 *  suo posto invece di restare fuori dallo schermo con l'app vuota. */
const ATTESA_MASSIMA = 1500;

/** Il dito e' partito dentro qualcosa che il gesto ce l'ha gia' suo?
 *
 *  ⚠️ Non e' teorico, e sono quattro casi veri di questa app: la striscia
 *  dei giorni e le tabelle di prospetto, supervisione e disponibilita'
 *  scorrono in orizzontale; le barre della supervisione si trascinano con
 *  `touch-action: none`; dentro un campo di testo il dito seleziona. In
 *  tutti e quattro cambiare pagina sarebbe la risposta sbagliata al gesto
 *  giusto. `data-scorrimento="no"` e' la porta per i casi che verranno. */
function gestoDiQualcunAltro(partenza: EventTarget | null, fermarsi: HTMLElement): boolean {
  let nodo = partenza instanceof HTMLElement ? partenza : null;
  while (nodo && nodo !== fermarsi) {
    if (nodo.dataset.scorrimento === "no") return true;
    if (nodo.isContentEditable) return true;
    const tag = nodo.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

    const stile = getComputedStyle(nodo);
    // Chi si dichiara `none` o `pan-y` sta dicendo esattamente questo: il
    // movimento orizzontale su di me non lo gestisce il browser, lo gestisco
    // io. Vale per le barre trascinabili della supervisione.
    if (stile.touchAction === "none" || stile.touchAction.startsWith("pan-y")) return true;
    const overflow = stile.overflowX;
    if ((overflow === "auto" || overflow === "scroll") && nodo.scrollWidth > nodo.clientWidth + 1) {
      return true;
    }
    nodo = nodo.parentElement;
  }
  return false;
}

/** Qualcosa di aperto sopra la pagina si prende tutto: sotto non si scorre.
 *  I pannelli di Radix stanno in un portale fuori da `<main>`, quindi il
 *  dito qui non arriverebbe comunque — ma un pannello che non e' modale
 *  esiste, e questa riga costa un `querySelector` a gesto. */
const qualcosaDiAperto = () =>
  document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]') !== null;

export function useScorrimentoPagine(
  /** L'area che scorre: e' li' che si ascolta il dito. */
  principale: React.RefObject<HTMLElement | null>,
  /** Gli indirizzi della barra, nel suo ordine. */
  percorsi: string[],
) {
  const router = useRouter();
  const pathname = usePathname();

  /** Il foglio che si muove: dentro c'e' la pagina. */
  const foglio = React.useRef<HTMLDivElement>(null);
  /** Alzato appena il gesto e' nostro. Lo legge il tiro-giu' di `AppShell`
   *  per mollare la presa: partono dallo stesso dito e a schermo in cima si
   *  contendono i primi pixel. */
  const orizzontale = React.useRef(false);

  const [anteprima, setAnteprima] = React.useState<Anteprima | null>(null);
  const anteprimaRef = React.useRef<Anteprima | null>(null);
  /** La pagina verso cui si sta andando, e da che parte: serve alla pagina
   *  che arriva per entrare dal lato giusto. */
  const [ingresso, setIngresso] = React.useState<{ percorso: string; verso: Verso } | null>(null);
  const entrataFinita = React.useCallback(() => setIngresso(null), []);
  const salvagente = React.useRef(0);

  // Le voci e la pagina aperta cambiano mentre gli ascoltatori sono gia'
  // appesi: si leggono da qui, non dalla chiusura — che li fotograferebbe al
  // primo giro e resterebbe ferma li'. L'aggiornamento sta in un effetto e
  // non nel corpo del componente perche' scrivere un ref mentre React
  // disegna e' proprio la cosa che il compilatore non lascia piu' fare.
  const ultimo = React.useRef({ percorsi, pathname });
  React.useEffect(() => {
    ultimo.current = { percorsi, pathname };
  });

  React.useEffect(() => {
    const main = principale.current;
    if (!main) return;

    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let xUltimo = 0;
    let tUltimo = 0;
    let asse: Asse = "indeciso";
    let ammesso = false;

    const mostra = (a: Anteprima | null) => {
      const p = anteprimaRef.current;
      if (p?.percorso === a?.percorso && p?.sicura === a?.sicura) return;
      anteprimaRef.current = a;
      setAnteprima(a);
    };

    const posa = (dx: number) => {
      const el = foglio.current;
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = dx === 0 ? "" : `translate3d(${dx}px, 0, 0)`;
      el.style.willChange = dx === 0 ? "" : "transform";
    };

    const tornaAlSuoPosto = () => {
      const el = foglio.current;
      if (!el) return;
      el.style.transition = "transform var(--pagina-durata) var(--pagina-rientro)";
      el.style.transform = "";
      window.setTimeout(() => {
        if (!el.isConnected) return;
        el.style.transition = "";
        el.style.willChange = "";
      }, 400);
    };

    const partito = (e: TouchEvent) => {
      asse = "indeciso";
      ammesso = false;
      if (e.touches.length !== 1) return;
      const { percorsi, pathname } = ultimo.current;
      if (percorsi.length < 2) return;
      if (indiceAttivo(percorsi, pathname) < 0) return;
      if (qualcosaDiAperto()) return;
      const t = e.touches[0];
      if (nellaZonaDiSistema(t.clientX, window.innerWidth)) return;
      if (gestoDiQualcunAltro(e.target, main)) return;
      x0 = xUltimo = t.clientX;
      y0 = t.clientY;
      t0 = tUltimo = e.timeStamp;
      ammesso = true;
    };

    const mosso = (e: TouchEvent) => {
      if (!ammesso || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;

      if (asse === "indeciso") {
        asse = asseDelGesto(dx, dy);
        if (asse === "indeciso") return;
        if (asse === "verticale") {
          ammesso = false;
          return;
        }
        orizzontale.current = true;
      }

      // Da qui il gesto e' nostro: si ferma lo scorrimento verticale, se no
      // l'elenco si muove sotto il dito mentre la pagina scivola di lato.
      if (e.cancelable) e.preventDefault();

      const { percorsi, pathname } = ultimo.current;
      posa(scostamento(dx, indiceAttivo(percorsi, pathname), percorsi.length));

      const meta = destinazione(percorsi, pathname, dx);
      mostra(
        meta
          ? {
              percorso: meta.percorso,
              sicura: Math.abs(dx) > main.clientWidth * QUOTA_PER_COMPLETARE,
            }
          : null,
      );

      xUltimo = t.clientX;
      tUltimo = e.timeStamp;
    };

    const finito = (e: TouchEvent) => {
      if (!ammesso) return;
      ammesso = false;
      orizzontale.current = false;
      const nostro = asse === "orizzontale";
      asse = "indeciso";
      mostra(null);
      if (!nostro) return;

      const t = e.changedTouches[0];
      if (!t) {
        tornaAlSuoPosto();
        return;
      }
      const dx = t.clientX - x0;
      const dt = Math.max(1, e.timeStamp - tUltimo);
      const { percorsi, pathname } = ultimo.current;
      const meta = destinazione(percorsi, pathname, dx);

      if (
        !meta ||
        !daCompletare({
          dx,
          larghezza: main.clientWidth,
          velocita: Math.abs(t.clientX - xUltimo) / dt,
          durata: e.timeStamp - t0,
        })
      ) {
        tornaAlSuoPosto();
        return;
      }

      // Il foglio finisce la corsa che il dito ha cominciato, e intanto si
      // chiede la pagina nuova. Le due cose non sono sincronizzabili: la
      // pagina arriva quando arriva, e questa uscita serve proprio a non far
      // sembrare fermo il telefono mentre si aspetta.
      const el = foglio.current;
      if (el) {
        el.style.transition =
          "transform var(--pagina-durata) var(--pagina-uscita), opacity var(--pagina-durata) linear";
        el.style.transform = `translate3d(${meta.verso === "avanti" ? "-100%" : "100%"}, 0, 0)`;
        el.style.opacity = "0";
      }
      setIngresso(meta);
      router.push(meta.percorso);

      window.clearTimeout(salvagente.current);
      salvagente.current = window.setTimeout(() => {
        // Anche l'ingresso si spegne: se la pagina chiesta non e' quella
        // arrivata — una voce spenta rimanda al tabellone — resterebbe
        // appeso, e si rigiocherebbe addosso a una navigazione futura.
        setIngresso(null);
        const el = foglio.current;
        if (!el) return;
        el.style.transition = "none";
        el.style.transform = "";
        el.style.opacity = "";
      }, ATTESA_MASSIMA);
    };

    const annullato = () => {
      if (!ammesso) return;
      ammesso = false;
      asse = "indeciso";
      orizzontale.current = false;
      mostra(null);
      tornaAlSuoPosto();
    };

    main.addEventListener("touchstart", partito, { passive: true });
    // Non passivo: quando il gesto e' nostro va fermato lo scorrimento.
    main.addEventListener("touchmove", mosso, { passive: false });
    main.addEventListener("touchend", finito, { passive: true });
    main.addEventListener("touchcancel", annullato, { passive: true });
    return () => {
      main.removeEventListener("touchstart", partito);
      main.removeEventListener("touchmove", mosso);
      main.removeEventListener("touchend", finito);
      main.removeEventListener("touchcancel", annullato);
      window.clearTimeout(salvagente.current);
    };
  }, [principale, router]);

  /** La pagina arrivata entra dal lato da cui e' stata chiamata. Il foglio
   *  porta `key={pathname}`: cambiando pagina il nodo e' nuovo, quindi la
   *  trasformazione dell'uscita se ne va da sola e l'animazione riparte
   *  senza doverla riavvolgere a mano. */
  const classeEntrata =
    ingresso && ingresso.percorso === pathname
      ? ingresso.verso === "avanti"
        ? "animate-entra-da-destra"
        : "animate-entra-da-sinistra"
      : undefined;

  return {
    foglio,
    orizzontale,
    anteprima,
    classeEntrata,
    /** Da chiamare a fine animazione: senza, tornando **col pulsante** sulla
     *  stessa pagina l'ingresso col dito si rigiocherebbe da solo. */
    entrataFinita,
  };
}

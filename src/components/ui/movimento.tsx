"use client";

import { LazyMotion, MotionConfig, domMin } from "motion/react";
import * as React from "react";

/** Le due curve dell'app, le stesse di `--curva-entrata` / `--curva-uscita`
 *  in globals.css. Stanno anche qui perche' `animate()` di motion e' una
 *  funzione e non legge ne' il CSS ne' il contesto: chi la chiama importa
 *  questa costante invece di riscrivere quattro numeri. */
export const CURVA_ENTRATA: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
export const CURVA_USCITA: [number, number, number, number] = [0.32, 0, 0.67, 0];

/** Il provider di `motion`, una volta sola, alla radice del guscio.
 *
 *  `motion` sta in package.json dal primo giorno e non lo importava nessuno:
 *  le animazioni dell'app sono CSS (globals.css, i token `--animate-*`) e
 *  restano CSS. La libreria entra solo per le due cose che il CSS non sa
 *  fare bene — un elemento che se ne va con un'animazione **dopo** essere
 *  uscito dall'albero, e un numero che scorre da un valore all'altro.
 *
 *  Entra nella versione piu' piccola che basta: `domMin` (animazioni e
 *  uscite, niente gesti ne' inView — nell'app non c'e' un solo `whileHover`
 *  o `whileTap`), e `strict`, che fa fallire la resa se qualcuno importa
 *  `motion.div` al posto di `m.div`, cioe' se qualcuno si porta dietro il
 *  pacchetto intero senza accorgersene. Costa comunque ~27 KB compressi su
 *  ogni rotta dell'app: e' il prezzo di averla ovunque, ed e' dichiarato.
 *
 *  Sta alla radice di `AppShell` e non dentro il foglio che cambia a ogni
 *  pagina: cosi' copre anche le tendine e i pannelli del guscio e non viene
 *  smontato e rimontato a ogni navigazione. `reducedMotion="user"`: chi ha
 *  chiesto al sistema meno movimento ha meno movimento anche qui, come gia'
 *  vale per il CSS. La `transition` di default e' la curva d'entrata: i
 *  componenti `m.*` portano solo la durata. */
export function Movimento({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMin} strict>
      <MotionConfig reducedMotion="user" transition={{ ease: CURVA_ENTRATA }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

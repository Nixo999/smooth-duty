/** Il gesto che cambia pagina col dito — la decisione, senza il DOM.
 *
 *  Sta qui e non dentro il componente per il motivo di tutti gli altri
 *  motori: le soglie di un gesto si sbagliano di poco, e il posto peggiore
 *  per accorgersene e' il telefono in mano. Cosi' invece si provano a riga
 *  di comando (`scripts/prova-scorrimento.mjs`, dentro `npm run prove`).
 *
 *  La parte che ascolta il dito sta in `components/scorrimento-pagine.ts`. */

/** Dove si sta andando: avanti e' la voce dopo nella barra, indietro quella
 *  prima. Il dito va nel verso opposto — si trascina la pagina via, come si
 *  sposta un foglio. */
export type Verso = "avanti" | "indietro";

/** Un gesto comincia indeciso: nei primi pixel non si sa ancora se il dito
 *  sta girando pagina o scorrendo l'elenco. */
export type Asse = "indeciso" | "orizzontale" | "verticale";

/** Prima di questi pixel non si sa ancora da che parte va il dito. */
export const SOGLIA_DECISIONE = 10;

/** Quanto piu' orizzontale che verticale, per prendersi il gesto. Sotto
 *  questo rapporto vince lo scorrimento: chi legge un elenco lungo muove il
 *  dito anche di lato, e non vuole cambiare pagina. */
export const RAPPORTO_MINIMO = 1.3;

/** Oltre questa parte di schermo il passaggio si completa da solo. */
export const QUOTA_PER_COMPLETARE = 0.28;

/** Un colpo secco basta anche se corto: pixel al millisecondo. */
export const VELOCITA_PER_COMPLETARE = 0.45;

/** Un colpo e' tale se e' breve: un dito che striscia lento per un secondo e
 *  poi accelera all'ultimo non ha "lanciato" niente. */
export const DURATA_MASSIMA_DEL_COLPO = 500;

/** E se ha fatto un po' di strada: sotto, e' un tocco che ha tremato. */
export const CORSA_MINIMA_DEL_COLPO = 30;

/** Agli estremi il dito trova resistenza invece del vuoto: la pagina si
 *  muove di un quarto, e quel poco dice «di qua non c'e' altro» meglio di
 *  qualunque scritta. */
export const RESISTENZA_AI_BORDI = 0.28;

/** I bordi verticali dello schermo sono del sistema: da li' si torna
 *  indietro nel browser e si esce dall'app. Contendere quel gesto non lo
 *  vince, lo rompe e basta — quindi un dito che parte di li' non e' nostro. */
export const ZONA_DI_SISTEMA = 24;

/** Da che parte sta andando questo dito. */
export function asseDelGesto(dx: number, dy: number): Asse {
  if (Math.abs(dx) < SOGLIA_DECISIONE && Math.abs(dy) < SOGLIA_DECISIONE) {
    return "indeciso";
  }
  return Math.abs(dx) > Math.abs(dy) * RAPPORTO_MINIMO ? "orizzontale" : "verticale";
}

/** Il dito e' partito dal bordo dello schermo? */
export function nellaZonaDiSistema(x: number, larghezza: number): boolean {
  return x <= ZONA_DI_SISTEMA || x >= larghezza - ZONA_DI_SISTEMA;
}

/** Quale voce della barra e' aperta adesso.
 *
 *  La corrispondenza e' **esatta**, non per prefisso, e non e' pigrizia: da
 *  `/turni/importa` si sta guardando l'anteprima di un foglio Excel appena
 *  caricato, e un dito di traverso che la butta via fa perdere il lavoro.
 *  Fuori dalle cinque pagine della barra il gesto non esiste. */
export function indiceAttivo(percorsi: readonly string[], percorso: string): number {
  return percorsi.indexOf(percorso);
}

/** Dove si finisce trascinando di `dx`, se da questa parte c'e' qualcosa. */
export function destinazione(
  percorsi: readonly string[],
  percorso: string,
  dx: number,
): { percorso: string; verso: Verso } | null {
  const i = indiceAttivo(percorsi, percorso);
  if (i < 0 || dx === 0) return null;
  const j = dx < 0 ? i + 1 : i - 1;
  if (j < 0 || j >= percorsi.length) return null;
  return { percorso: percorsi[j], verso: dx < 0 ? "avanti" : "indietro" };
}

/** Di quanto si sposta la pagina sotto il dito. E' `dx`, tranne agli
 *  estremi dell'elenco dove diventa una frazione. */
export function scostamento(dx: number, indice: number, quante: number): number {
  const alBordo = (dx < 0 && indice >= quante - 1) || (dx > 0 && indice <= 0);
  return alBordo ? dx * RESISTENZA_AI_BORDI : dx;
}

/** Al rilascio: si completa il passaggio o la pagina torna al suo posto?
 *
 *  Due strade, e ne basta una: il dito ha portato la pagina abbastanza in
 *  la', oppure l'ha lanciata. La seconda e' quella che rende il gesto
 *  rapido — senza, per cambiare pagina si dovrebbe attraversare mezzo
 *  schermo ogni volta. */
export function daCompletare({
  dx,
  larghezza,
  velocita,
  durata,
}: {
  dx: number;
  larghezza: number;
  /** Pixel al millisecondo dell'**ultimo tratto**, non della corsa intera:
   *  un dito che rallenta e si ferma non deve completare il passaggio. */
  velocita: number;
  durata: number;
}): boolean {
  const abbastanzaLontano = Math.abs(dx) > larghezza * QUOTA_PER_COMPLETARE;
  const abbastanzaRapido =
    velocita > VELOCITA_PER_COMPLETARE &&
    durata < DURATA_MASSIMA_DEL_COLPO &&
    Math.abs(dx) > CORSA_MINIMA_DEL_COLPO;
  return abbastanzaLontano || abbastanzaRapido;
}

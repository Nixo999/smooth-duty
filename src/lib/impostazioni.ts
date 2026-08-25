import { CODICI_CAUSALE } from "@/lib/assenze";

/** Le impostazioni dell'azienda: una riga in `company_settings`, o niente.
 *
 *  «Niente» è il caso normale per le aziende nate prima della tabella, e
 *  deve valere quanto una riga coi default: per questo il tipo e i default
 *  stanno qui, condivisi fra server e browser, e chi legge passa sempre da
 *  `normalizzaImpostazioni`.
 *
 *  Sono raggruppate per pagina, come nella schermata che le mostra: chi
 *  cerca una regola parte sempre da dove la vede applicata. */
export type Impostazioni = {
  /* ------------------------------------------------------------ turni
   *  I nomi cominciano tutti per `conferma_` perché sono nati quando quei
   *  turni aspettavano un sì. Oggi il verso è rovesciato — il turno vale
   *  subito e l'interessato semmai lo rifiuta — ma le colonne si chiamano
   *  ancora così: rinominarle costerebbe una migrazione e una giornata di
   *  disallineamento, e non direbbe niente di più. */
  /** Un turno nuovo oltre le ore da contratto è rifiutabile? */
  conferma_straordinari: boolean;
  /** Una modifica a una settimana già pubblicata è rifiutabile? Due
   *  interruttori: le modifiche che generano straordinario e le altre. */
  conferma_modifiche: boolean;
  conferma_modifiche_straordinari: boolean;
  /** Con gli orari preimpostati accesi, un turno diverso dall'orario del
   *  contratto della persona è rifiutabile. */
  orari_preimpostati: boolean;
  /** Cambiare solo il reparto di un turno, senza toccarne gli orari, è
   *  rifiutabile? Di suo no: le ore restano quelle. */
  conferma_cambio_reparto: boolean;
  /** Alla **pubblicazione**, chi va in straordinario riceve una domanda sola
   *  sulla settimana intera invece di una per turno. È l'unico interruttore
   *  che riguarda un gesto e non un turno: si accende quando l'azienda
   *  vuole il sì della persona *prima* che la settimana cominci. */
  conferma_settimana: boolean;

  /* ----------------------------------------------------- supervisione */
  /** L'azienda usa la Supervisione? Spenta, sparisce a tutti. */
  pagina_supervisione: boolean;
  /** La Supervisione la vedono anche i dipendenti? */
  supervisione_dipendenti: boolean;

  /* --------------------------------------------------------- permessi */
  pagina_permessi: boolean;
  /** Le causali che un dipendente può chiedere dai Permessi. */
  causali_richiedibili: string[];

  /* -------------------------------------------------------- prospetto */
  pagina_prospetto: boolean;
};

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  conferma_straordinari: false,
  conferma_modifiche: false,
  conferma_modifiche_straordinari: false,
  orari_preimpostati: false,
  conferma_cambio_reparto: false,
  conferma_settimana: false,
  pagina_supervisione: true,
  supervisione_dipendenti: true,
  pagina_permessi: true,
  causali_richiedibili: [...CODICI_CAUSALE],
  pagina_prospetto: true,
};

export function normalizzaImpostazioni(
  riga: Partial<Impostazioni> | null | undefined,
): Impostazioni {
  if (!riga) return IMPOSTAZIONI_DEFAULT;
  return { ...IMPOSTAZIONI_DEFAULT, ...riga };
}

export const COLONNE_IMPOSTAZIONI =
  "conferma_straordinari, conferma_modifiche, conferma_modifiche_straordinari, " +
  "orari_preimpostati, conferma_cambio_reparto, conferma_settimana, " +
  "pagina_supervisione, " +
  "supervisione_dipendenti, pagina_permessi, causali_richiedibili, pagina_prospetto";

/* Le tre `pagina_*` valgono in due posti, e vanno tenuti d'accordo: il menu
   (src/app/(app)/layout.tsx) che nasconde la voce, e la pagina stessa che
   si rifiuta di aprirsi dal suo indirizzo. Nascondere e basta non basta:
   l'indirizzo se lo ricorda il browser. */

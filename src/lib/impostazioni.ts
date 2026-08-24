import { CODICI_CAUSALE } from "@/lib/assenze";

/** Le impostazioni dell'azienda: una riga in `company_settings`, o niente.
 *
 *  «Niente» è il caso normale per le aziende nate prima della tabella, e
 *  deve valere quanto una riga coi default: per questo il tipo e i default
 *  stanno qui, condivisi fra server e browser, e chi legge passa sempre da
 *  `normalizzaImpostazioni`. */
export type Impostazioni = {
  /** La Supervisione la vedono anche i dipendenti? */
  supervisione_dipendenti: boolean;
  /** Le causali che un dipendente può chiedere dai Permessi. */
  causali_richiedibili: string[];
  /** Un turno nuovo oltre le ore da contratto va accettato dall'interessato? */
  conferma_straordinari: boolean;
  /** Una modifica a una settimana già pubblicata va accettata? Due
   *  interruttori: le modifiche che generano straordinario e le altre. */
  conferma_modifiche: boolean;
  conferma_modifiche_straordinari: boolean;
  /** Con gli orari preimpostati accesi, un turno diverso dall'orario del
   *  contratto della persona va accettato. */
  orari_preimpostati: boolean;
};

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  supervisione_dipendenti: true,
  causali_richiedibili: [...CODICI_CAUSALE],
  conferma_straordinari: false,
  conferma_modifiche: false,
  conferma_modifiche_straordinari: false,
  orari_preimpostati: false,
};

export function normalizzaImpostazioni(
  riga: Partial<Impostazioni> | null | undefined,
): Impostazioni {
  if (!riga) return IMPOSTAZIONI_DEFAULT;
  return { ...IMPOSTAZIONI_DEFAULT, ...riga };
}

export const COLONNE_IMPOSTAZIONI =
  "supervisione_dipendenti, causali_richiedibili, conferma_straordinari, " +
  "conferma_modifiche, conferma_modifiche_straordinari, orari_preimpostati";

export type ParsedShift = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
};

/** Una casella che non e' un orario ma vuol dire qualcosa: R, F, A... */
export type ParsedMarker = {
  date: string;
  code: string;
  label: string;
};

/** Le ore che abbiamo calcolato non coincidono con quelle scritte nel file.
 *  E' il segnale che abbiamo letto male, e va mostrato prima di importare. */
export type TotalMismatch = {
  date: string;
  dichiarato: number;
  calcolato: number;
};

export type ParsedPerson = {
  index: number;
  nome: string;
  cognome: string;
  fullName: string;
  reparto: string | null;
  shifts: ParsedShift[];
  markers: ParsedMarker[];
  mismatches: TotalMismatch[];
};

export type ParseResult = {
  layout: "wide" | "long";
  sheetName: string;
  sheetNames: string[];
  days: string[];
  people: ParsedPerson[];
  warnings: string[];
};

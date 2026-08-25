export type Role = "capo" | "dipendente";

export type Company = {
  id: string;
  name: string;
};

/** Reparto: cucina, sala, cassa. Nome e colore li decide il responsabile. */
export type Department = {
  id: string;
  company_id: string;
  name: string;
  /** Tinta in gradi (0-360). Il colore finito lo compone il foglio di stile,
   *  perché chiaro e scuro hanno bisogno di due luminosità diverse. */
  hue: number;
  position: number;
};

/** Una fascia di copertura, cioè un "turno" del reparto: in quelle ore
 *  servono tante persone. È la regola con cui si stabilisce se una giornata
 *  è scoperta. */
export type CoverageBand = {
  id: string;
  company_id: string;
  department_id: string;
  name: string;
  start_time: string; // HH:MM:SS
  end_time: string;
  required: number;
  /** 1 = lunedì … 7 = domenica. */
  weekdays: number[];
  position: number;
};

/** Un'assenza: malattia e simili. end_date null = ancora in corso, finché
 *  qualcuno non conferma il rientro. */
export type Absence = {
  id: string;
  company_id: string;
  profile_id: string;
  /** Codice della causale. I valori ammessi stanno in `CAUSALI`
   *  (src/lib/assenze.ts) e nel vincolo `absences_causale_valida`. */
  type: string;
  start_date: string; // YYYY-MM-DD
  /** Ultimo giorno di assenza, compreso. null = ancora in corso. */
  end_date: string | null;
  note: string | null;
};

/** Una richiesta di permesso o assenza: nasce "con riserva" e vale solo
 *  quando il responsabile la conferma. L'assenza vera la crea
 *  l'approvazione, e absence_id ricorda quale, per poterla revocare. */
export type VacationRequest = {
  id: string;
  company_id: string;
  profile_id: string;
  /** Causale, stesso elenco di absences: all'approvazione passa pari pari. */
  type: string;
  start_date: string; // YYYY-MM-DD
  /** Ultimo giorno compreso: una richiesta senza fine non esiste. */
  end_date: string;
  note: string | null;
  status: "richiesta" | "approvata" | "rifiutata";
  absence_id: string | null;
};

/** Quello che di un'assenza possono vedere i colleghi: i giorni, non il
 *  perché. Arriva dalla vista `absence_days`, che il motivo non lo contiene
 *  proprio — così non c'è niente da dimenticare di nascondere. */
export type AbsenceDay = {
  id: string;
  profile_id: string;
  start_date: string;
  end_date: string | null;
};

export type Profile = {
  id: string;
  company_id: string;
  /** L'account con cui entra, se ce l'ha. null = sta in squadra e va in
   *  turno, ma nell'app non può entrare. */
  user_id: string | null;
  full_name: string;
  /** null per chi non ha un accesso: non c'è un indirizzo a cui scrivere. */
  email: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  /** Reparto principale: quello scritto accanto al nome, e quello che vale
   *  quando non c'è altro da cui dedurre. */
  department_id: string | null;
  /** Tutti i reparti in cui può lavorare — non contemporaneamente: in un
   *  turno fa una cosa sola, ma da un giorno all'altro può cambiare. */
  reparti: string[];
  /** Ore settimanali da contratto. null per chi è a chiamata. */
  contract_hours: number | null;
  on_call: boolean;
  /** A chiamata, part time o full time: lo dice la scheda, non una soglia
   *  automatica. `on_call` resta il gemello operativo di "chiamata". */
  contract_type: "chiamata" | "part_time" | "full_time";
  /** Orario preimpostato dal contratto (HH:MM:SS), se ce l'ha. Diventa
   *  vincolante solo con l'interruttore nelle impostazioni dell'azienda. */
  preset_start: string | null;
  preset_end: string | null;
};

export type Shift = {
  id: string;
  company_id: string;
  profile_id: string | null;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  title: string | null;
  location: string | null;
  notes: string | null;
  /** Reparto solo per questo turno: serve a dire "oggi copre in sala".
   *  null = vale quello della persona. */
  department_id: string | null;
  /** Perché il turno aspetta un sì dell'interessato. null = non serve.
   *  I valori ammessi stanno anche nel vincolo
   *  `shifts_richiede_conferma_valido`: aggiungerne uno vuol dire toccare
   *  tutti e due. */
  richiede_conferma:
    | "straordinario"
    | "modifica"
    | "modifica_straordinario"
    | "orario_diverso"
    | "cambio_reparto"
    | null;
  confermato_at: string | null;
};

/** Il profilo di chi sta usando l'app, con l'azienda gia' risolta. */
export type SessionUser = Profile & { company: Company };

/** Chi ha fatto accesso, prima di sapere cosa puo' fare.
 *
 *  Le due cose sono indipendenti: l'amministratore della piattaforma non
 *  appartiene a nessuna azienda (profile e' null), un capo non amministra la
 *  piattaforma, e lo stesso account puo' essere entrambe le cose. */
export type Viewer = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  profile: SessionUser | null;
};

/** Riga della lista aziende, come la vede l'amministratore. */
export type CompanyRow = Company & {
  created_at: string;
  people: number;
  responsabili: { full_name: string; email: string }[];
  /** Tutte le persone, per poterle elencare e aggiungerne dal pannello. */
  persone: {
    id: string;
    user_id: string | null;
    full_name: string;
    email: string | null;
    role: Role;
    must_change_password: boolean;
  }[];
};

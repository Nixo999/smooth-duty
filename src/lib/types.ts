import type { VersoDichiarazione } from "@/lib/disponibilita";

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
  /** Perché su questo turno l'interessato può dire la sua. null = è un turno
   *  come tutti gli altri.
   *
   *  Il turno vale comunque — è preapprovato — e questo campo dice soltanto
   *  che c'è qualcosa di particolare da segnalare, e cosa. I valori ammessi
   *  stanno anche nel vincolo `shifts_richiede_conferma_valido`: aggiungerne
   *  uno vuol dire toccare tutti e due. */
  richiede_conferma: MotivoRifiuto | null;
  /** Ha detto di sì: da quando. Non serviva a rendere valido il turno, che
   *  lo era già; serve a distinguere «ha guardato ed è d'accordo» da «non si
   *  è ancora fatto vivo». */
  confermato_at: string | null;
  /** Ha detto no: da quando, e volendo perché. Le due date si escludono a
   *  vicenda — una posizione presa non si cambia — e a leggerle insieme
   *  pensa `statoConferma` in src/lib/conferme.ts. */
  rifiutato_at: string | null;
  nota_rifiuto: string | null;
};

/** Perché un turno si può rifiutare.
 *
 *  Un elenco solo, da cui si derivano il tipo **e** la validazione delle
 *  Server Action: erano due copie, e aggiungere `turno_spostato` ne ha
 *  trovata una terza dimenticata dietro (`ripristinaTurni` rifiutava i turni
 *  col motivo nuovo, in silenzio). Le mappe delle etichette sono
 *  `Record<MotivoRifiuto, string>`, quindi il compilatore le tiene in pari
 *  da solo. Resta una sola copia altrove, il vincolo
 *  `shifts_richiede_conferma_valido`, che `verifica-schema.mjs` controlla.
 *
 *  `turno_spostato` — stesse ore, altro giorno o altro orario — era un avviso
 *  fino al 26 agosto 2026: contare le ore e concludere che non è cambiato
 *  niente è un ragionamento da contabile, il mattino e il pomeriggio non sono
 *  la stessa giornata.
 *
 *  `chiamata` è l'unico che **non** è una facoltà. Sotto il regime
 *  `on_demand` chi è a chiamata deve rispondere, e il silenzio non vale come
 *  un sì: quel turno è una proposta finché la risposta non arriva. Sta qui
 *  in mezzo agli altri perché la macchina è la stessa — `accetta_turno`,
 *  `rifiuta_turno`, `stato_prima` — e a cambiare è soltanto come lo racconta
 *  l'interfaccia. Le regole in `lib/disponibilita.ts`. */
export const MOTIVI_RIFIUTO = [
  "straordinario",
  "modifica",
  "modifica_straordinario",
  "orario_diverso",
  "cambio_reparto",
  "turno_spostato",
  "chiamata",
] as const;

export type MotivoRifiuto = (typeof MOTIVI_RIFIUTO)[number];

/** Un turno com'era, quel tanto che basta a rimetterlo dov'era.
 *
 *  `profile_id` c'è perché una modifica può aver cambiato la persona: senza,
 *  il ripristino rimetterebbe gli orari giusti addosso a chi il turno l'ha
 *  appena rifiutato. */
export type StatoTurno = {
  profile_id: string | null;
  date: string;
  start_time: string; // HH:MM
  end_time: string;
  department_id: string | null;
  title: string | null;
  location: string | null;
  notes: string | null;
};

/** Il no di un dipendente, in attesa del responsabile.
 *
 *  `esito` è vuoto finché il responsabile non apre il messaggio: è
 *  l'apertura a far tornare indietro il turno o a toglierlo, e il messaggio
 *  poi racconta quale delle due è stata. */
export type MessaggioTurno = {
  id: string;
  profile_id: string;
  shift_id: string | null;
  motivo: MotivoRifiuto;
  nota: string | null;
  giorno: string;
  turno_prima: StatoTurno | null;
  turno_dopo: StatoTurno;
  esito: "ripristinato" | "da_rifare" | "superato" | null;
  creato_at: string;
  visto_at: string | null;
  risolto_at: string | null;
};

/** Un avviso: il verso opposto di `MessaggioTurno`.
 *
 *  Il responsabile ha cambiato qualcosa che *toglie* ore, e l'interessato ha
 *  diritto di saperlo — non di concederlo. Non c'è niente da decidere: si
 *  chiude con «ho letto», e finché non lo si preme resta in vista. */
export type Avviso = {
  id: string;
  profile_id: string;
  shift_id: string | null;
  motivo: MotivoAvviso;
  giorno: string;
  turno_prima: StatoTurno;
  /** null quando il turno è stato tolto: non c'è un «dopo». */
  turno_dopo: StatoTurno | null;
  creato_at: string;
  letto_at: string | null;
};

/** `shift_notices.motivo` ammette anche `turno_spostato`, che dalla
 *  migrazione `17` non viene più scritto: spostare un turno si chiede, non si
 *  comunica. Il valore resta ammesso nel database — toglierlo costerebbe un
 *  vincolo riscritto per non dire niente di più. */
export type MotivoAvviso = "ore_tolte" | "turno_rimosso";

/** La domanda che nasce alla pubblicazione: non otto domande su otto turni,
 *  una sola sulla settimana.
 *
 *  Due ragioni, e sono due conversazioni diverse: `straordinario` chiede
 *  «questa settimana ti porta oltre il contratto, ti va bene?»; `chiamata`
 *  chiede «questa settimana ci sei?» a chi è a chiamata, sotto il regime
 *  `on_demand`. Per la seconda `minuti_contratto` vale zero, che non è un
 *  dato mancante travestito da numero: è esattamente quello che dice il
 *  contratto di chi lavora quando serve.
 *
 *  I due totali di minuti sono congelati alla nascita: il tabellone cambia, e
 *  una richiesta deve poter raccontare la settimana su cui è nata. */
export type RichiestaSettimana = {
  id: string;
  profile_id: string;
  monday: string;
  motivo: "straordinario" | "chiamata";
  minuti_previsti: number;
  minuti_contratto: number;
  stato: "in_attesa" | "accettata" | "rifiutata";
  /** Il perché del no, o il ritocco chiesto insieme al sì. È lo stesso
   *  spazio: due colonne di cui una sempre vuota non direbbero di più. */
  nota: string | null;
  creato_at: string;
  deciso_at: string | null;
  visto_at: string | null;
};

/** Una dichiarazione di chi è a chiamata: questo giorno, e in quale verso.
 *
 *  `dalle` e `alle` nulli tutt'e due vogliono dire il giorno intero; con gli
 *  orari, `alle <= dalle` scavalca la mezzanotte come ovunque nell'app.
 *
 *  Il verso sta sulla riga e non solo nell'impostazione dell'azienda:
 *  cambiando regime, un elenco di soli giorni si rovescerebbe di senso in
 *  silenzio. Le regole in `lib/disponibilita.ts`. */
export type Disponibilita = {
  id: string;
  company_id: string;
  profile_id: string;
  giorno: string; // YYYY-MM-DD
  dalle: string | null; // HH:MM:SS
  alle: string | null;
  verso: VersoDichiarazione;
  nota: string | null;
  /** Chi l'ha scritta: quasi sempre l'interessato, ma il responsabile può
   *  registrare quello che gli è stato detto al telefono. */
  creato_da: string | null;
  creato_at: string;
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

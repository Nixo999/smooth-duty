/** I messaggi d'errore che finiscono davanti a chi usa l'app.
 *
 *  ## Perché questo file esiste
 *
 *  Prima, una cinquantina di punti restituivano al toast il messaggio
 *  testuale del database. Uno schermo che dice «new row violates row-level
 *  security policy for table "shifts"» davanti a un negoziante smette di
 *  essere un prodotto e diventa un cantiere: chi legge non capisce se ha
 *  sbagliato lui, se ha perso i dati, o se deve chiamare qualcuno.
 *
 *  ## La regola delle due frasi
 *
 *  Ogni messaggio che esce da qui è fatto di **due frasi, in quest'ordine**:
 *
 *  1. **cosa è successo — e soprattutto cosa NON è successo ai dati.**
 *     La prima domanda di chi legge un errore non è «perché», è «ho perso
 *     quello che avevo scritto?». Se non gliela si risponde subito, la
 *     cerca ricaricando, riprovando, e a volte rifacendo il lavoro due
 *     volte.
 *  2. **cosa fa adesso.** Un errore che si ferma sul guasto lascia la
 *     persona in mezzo alla stanza. Anche «riprova fra un minuto» è
 *     un'istruzione; «errore imprevisto» non lo è.
 *
 *  ## Le tre cose che un messaggio non fa mai
 *
 *  - **non nomina il ferro**: niente Supabase, Postgres, policy, migrazioni,
 *    schema cache, nomi di tabelle o di vincoli. Chi legge non ha modo di
 *    agire su nessuna di quelle parole;
 *  - **non manda a un'assistenza che non esiste.** Non c'è un ufficio
 *    ticket: si rimanda a *chi ha installato l'app*, che è una persona vera
 *    e raggiungibile. Promettere un supporto è una bugia che si scopre al
 *    primo errore serio;
 *  - **non dice «io» né «noi»**: l'app parla di sé in terza persona;
 *  - **non usa le parole che l'app non usa da nessuna parte**: bozza, monte
 *    ore, causale, preapprovato, con riserva. Sono parole nostre, non di chi
 *    lavora in negozio, e su uno schermo d'errore costano il doppio. Un
 *    controllo le cerca da solo (`scripts/prova-errori.mjs`).
 *
 *  ## Come si aggiunge un caso
 *
 *  Si aggiunge un ramo in `messaggioErrore` **solo** quando il caso è
 *  distinguibile da un codice o da un nome di vincolo, e quando la frase
 *  che se ne ricava dice qualcosa in più del ripiego generico. Un ramo che
 *  produce «non è stato possibile completare l'operazione» con altre parole
 *  è peggio di niente: aggiunge codice e non aggiunge informazione.
 *
 *  Due cose che questo file **non** fa, e non sono dimenticanze:
 *  - i messaggi già scritti per chi legge (quelli sollevati dai trigger del
 *    database, che sono frasi italiane compiute) passano interi: sanno
 *    *quale* dato non torna, cosa che nessuna mappa per codice può sapere;
 *  - le traduzioni che stanno accanto alla singola azione — «Esiste già un
 *    reparto con questo nome» — restano dove sono. Sono più precise di
 *    qualunque regola generale, perché conoscono il gesto che l'ha
 *    provocata. */

/** Un errore il cui messaggio è già scritto per chi usa l'app.
 *
 *  Serve a distinguere le eccezioni che solleviamo noi apposta (il file
 *  `.xls`, il foglio senza intestazione) da quelle della libreria che legge
 *  l'Excel, che parlano inglese e di ZIP. Senza il marcatore le due cose
 *  hanno la stessa forma e l'unico modo di separarle sarebbe l'elenco dei
 *  testi, che marcisce al primo ritocco. */
export class ErroreLeggibile extends Error {}

/** La forma comune di un errore che arriva dal database o dall'accesso:
 *  entrambi hanno `message`, il primo ha anche `code`. */
type ErroreGrezzo = { code?: string; message?: string; details?: string };

function grezzo(errore: unknown): ErroreGrezzo {
  if (typeof errore === "string") return { message: errore };
  if (errore && typeof errore === "object") return errore as ErroreGrezzo;
  return {};
}

/** Il testo su cui cercare i nomi di vincolo: Postgres li mette nel
 *  messaggio, PostgREST a volte solo nel dettaglio. */
function testo(e: ErroreGrezzo) {
  return `${e.message ?? ""} ${e.details ?? ""}`;
}

const RIPIEGO =
  "L'operazione non è andata a buon fine e i dati sono rimasti come prima. " +
  "Riprova fra un momento; se succede ancora, segnalalo a chi ti ha installato l'app.";

/** Vero quando il guasto è che l'app chiede al database qualcosa che su
 *  questo account non c'è ancora — una colonna o una tabella che una
 *  modifica allo schema non ha mai portato.
 *
 *  È l'unica diagnosi che questa app sa fare da sola, e vale oro: senza,
 *  il sintomo è una pagina che mostra i valori di default come se fossero
 *  quelli dell'azienda. Il ragionamento resta, il testo tecnico che lo
 *  produce **non si mostra**: si scrive nel registro del server, dove lo
 *  legge chi può rimediare. */
export function serveAggiornamento(errore: unknown): boolean {
  const e = grezzo(errore);
  if (e.code === "42703" || e.code === "42P01") return true;
  if (e.code === "PGRST204" || e.code === "PGRST205" || e.code === "PGRST202") return true;
  const t = testo(e);
  return (
    /column .* does not exist/i.test(t) ||
    /relation .* does not exist/i.test(t) ||
    /Could not find the .* in the schema cache/i.test(t)
  );
}

/** Le due frasi da mostrare per questo guasto. */
export function messaggioErrore(errore: unknown): string {
  // Quello che abbiamo scritto noi per chi legge passa intero: è già la
  // frase giusta, e conosce il dettaglio che qui non si può sapere.
  if (errore instanceof ErroreLeggibile) return errore.message;

  const e = grezzo(errore);
  const t = testo(e);
  const msg = e.message ?? "";

  // L'app chiede un dato che su questo account non esiste ancora. Non è
  // colpa di chi sta usando l'app e non si sistema da dentro l'app.
  if (serveAggiornamento(e)) {
    return (
      "Questa parte dell'app non è ancora attiva su questo account, quindi non è " +
      "stato salvato niente e i dati che ci sono restano dove sono. " +
      "Segnalalo a chi ti ha installato l'app: si sistema da lì, in pochi minuti."
    );
  }

  // Il collegamento non c'è. Va detto prima di tutto il resto, perché è
  // l'unico caso in cui riprovare fra un minuto funziona davvero.
  if (
    /fetch failed|failed to fetch|networkerror|network request failed/i.test(t) ||
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(t) ||
    (errore as { name?: string })?.name === "AuthRetryableFetchError"
  ) {
    return (
      "I dati non si raggiungono in questo momento e niente è stato modificato. " +
      "Controlla la connessione e riprova fra un minuto: quello che avevi scritto è ancora qui."
    );
  }

  // La sessione è finita mentre si lavorava. Succede lasciando la pagina
  // aperta tutta la notte, ed è il caso in cui «riprova» non serve a nulla.
  if (
    e.code === "PGRST301" ||
    /JWT expired|Invalid Refresh Token|refresh_token_not_found|session_not_found/i.test(t)
  ) {
    return (
      "La sessione è scaduta prima che la modifica partisse, quindi non è cambiato niente. " +
      "Esci e rientra, poi rifai l'ultima cosa che stavi facendo."
    );
  }

  // Il database ha rifiutato la scrittura perché chi la chiede non ha il
  // permesso su quella riga. Per chi legge è un fatto di ruoli, non di
  // regole di sicurezza.
  if (e.code === "42501" || /violates row-level security/i.test(t)) {
    return (
      "Questa modifica non ti è permessa, e infatti non è stata fatta. " +
      "Se dovresti poterla fare, chiedilo a chi gestisce i turni della tua azienda."
    );
  }

  // I trigger di coerenza fra aziende sollevano frasi italiane compiute
  // («Il reparto non appartiene a questa azienda»): sono migliori di
  // qualunque cosa si possa scrivere qui, perché sanno *quale* dato non
  // torna. Si aggiunge solo la seconda frase, quella che manca sempre.
  if (e.code === "P0001" && msg.trim()) {
    const causa = msg.trim();
    const punteggiata = /[.!?]$/.test(causa) ? causa : `${causa}.`;
    return `${punteggiata} Niente è stato modificato: ricarica la pagina e riprova.`;
  }

  // Un doppione. I casi in cui si sa *di che cosa* meritano la loro frase:
  // «esiste già un dato uguale» non dice a nessuno dove guardare.
  if (e.code === "23505") {
    if (/availability_days_(giorno_intero|fascia)/i.test(t)) {
      return (
        "Su quel giorno una dichiarazione c'è già, e non ne è stata aggiunta una seconda. " +
        "Apri il giorno e cambia quella che c'è."
      );
    }
    if (/week_requests_/i.test(t)) {
      return (
        "Per quella settimana la richiesta è già partita, e non ne è stata creata un'altra. " +
        "Aspetta la risposta: compare qui appena arriva."
      );
    }
    return (
      "Esiste già un dato uguale a questo, quindi non ne è stato aggiunto un doppione. " +
      "Controlla l'elenco: quello che stavi inserendo c'è già."
    );
  }

  // Una regola di coerenza sul singolo dato.
  if (e.code === "23514") {
    if (/ore_o_chiamata/i.test(t)) {
      return (
        "Chi lavora a chiamata non può avere anche le ore a settimana del contratto, quindi " +
        "la persona non è stata modificata. Scegli una delle due cose e salva di nuovo."
      );
    }
    if (/orario_coerente/i.test(t)) {
      return (
        "L'orario di fine viene prima di quello di inizio, quindi non è stato salvato niente. " +
        "Correggi gli orari e riprova."
      );
    }
    if (/causale_valida/i.test(t)) {
      return (
        "Quel motivo non è fra quelli che l'azienda ammette, e la richiesta non è partita. " +
        "Scegline uno dall'elenco e riprova."
      );
    }
    return (
      "Il dato non rispetta una delle regole dell'azienda, quindi non è stato salvato. " +
      "Controlla i campi che hai cambiato e riprova."
    );
  }

  // Un dato che serviva non c'è (o non c'è più): tipicamente si sta
  // modificando qualcosa che un'altra persona ha appena tolto.
  if (e.code === "23503" || e.code === "23502") {
    return (
      "Manca un dato che serviva, e per questo non è stato salvato niente. " +
      "Ricarica la pagina — di solito vuol dire che qualcun altro ha cambiato qualcosa nel frattempo — e riprova."
    );
  }

  // Le password: le risponde il servizio di accesso, sempre in inglese.
  if (/should be different|New password should be/i.test(t)) {
    return (
      "La nuova password è uguale a quella di adesso, quindi non è stata cambiata. " +
      "Scegline una diversa e salva."
    );
  }
  if (/password should be at least|password is too short/i.test(t)) {
    // Il numero non si scrive qui. In questa app di minimi ce ne sono
    // quattro — 6 sul servizio di accesso, 5 sugli account creati dalla
    // scheda persona, 8 sulla password reimpostata dall'amministratore, 10
    // su quella che sceglie la persona — e una cifra fissa in questo punto
    // sarebbe sbagliata su tre casi su quattro. Quando il rifiuto lo dice,
    // si riporta il suo; altrimenti si tace la cifra invece di inventarla.
    const minimo = /at least (\d+)/i.exec(t)?.[1];
    return (
      "La password è troppo corta e non è stata cambiata. " +
      (minimo
        ? `Usane una di almeno ${minimo} caratteri: la lunghezza è quello che conta.`
        : "Usane una più lunga: la lunghezza conta più dei simboli.")
    );
  }
  if (/already registered|already been registered|already exists/i.test(t)) {
    return (
      "Con questa email un accesso esiste già, e non ne è stato creato un altro. " +
      "Usa un altro indirizzo, oppure riapri la persona che ce l'ha."
    );
  }
  if (/user not found/i.test(t)) {
    return (
      "Questa persona non ha più un accesso, quindi la password non è stata cambiata. " +
      "Ricreale l'accesso dalla sua scheda, poi riprova."
    );
  }

  return RIPIEGO;
}

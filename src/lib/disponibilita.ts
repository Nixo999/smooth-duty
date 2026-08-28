/** Le regole di ingaggio di chi è a chiamata.
 *
 *  Chi ha un contratto a ore ha già scritto quando lavora: il monte ore,
 *  l'orario preimpostato, la settimana da rispettare. Chi è a chiamata no —
 *  l'accordo vero («il giovedì no», «i weekend sì») viveva in una telefonata
 *  di cui l'app non sapeva niente, e il responsabile se lo ricordava a
 *  memoria.
 *
 *  Qui quell'accordo diventa una regola, e l'azienda sceglie in che forma:
 *
 *  | Regime | Chi scrive il calendario | Cosa fa l'app quando si assegna |
 *  |---|---|---|
 *  | `indisponibilita` | il lavoratore, sui giorni in cui **non** può | rifiuta il turno su quei giorni, e negli altri lascia fare |
 *  | `disponibilita` | il lavoratore, sui giorni in cui **può** | rifiuta il turno fuori da quei giorni: il vincolo è del datore |
 *  | `on_demand` | nessuno | assegna, e chiede al lavoratore di accettare la chiamata |
 *
 *  Funzione pura come gli altri motori, e per la stessa ragione: la stessa
 *  domanda la fanno il salvataggio di un turno, la copia di una settimana e
 *  il tabellone che disegna la casella. Tre risposte diverse vorrebbero dire
 *  un turno che il tabellone mostra come assegnabile e il server rifiuta.
 *
 *  Si prova con `node --import ./scripts/alias.mjs scripts/prova-disponibilita.mjs`,
 *  senza browser e senza database. */

/** I tre modi in cui un'azienda ingaggia chi è a chiamata. Elenco unico, da
 *  cui si derivano il tipo, la validazione della Server Action e le
 *  etichette: il vincolo `company_settings_regime_chiamata_valido` ne è
 *  l'unica altra copia, e `verifica-schema.mjs` controlla che siano
 *  d'accordo. */
export const REGIMI_CHIAMATA = [
  "indisponibilita",
  "disponibilita",
  "on_demand",
] as const;

export type RegimeChiamata = (typeof REGIMI_CHIAMATA)[number];

/** In che verso ha parlato il lavoratore.
 *
 *  Sta sulla riga della dichiarazione e non solo nell'impostazione: cambiando
 *  regime, un elenco di soli giorni si rovescerebbe di senso in silenzio, e
 *  «il 12 non posso» diventerebbe «il 12 posso» senza che nessuno l'abbia
 *  detto. */
export type VersoDichiarazione = "non_posso" | "posso";

/** Il verso che il regime **legge**. Le dichiarazioni nell'altro verso
 *  restano scritte e smettono di contare: sono la storia di un accordo
 *  precedente, non una regola in vigore. `on_demand` non ne legge nessuna,
 *  perché sotto quel regime il calendario non esiste. */
export function versoDelRegime(regime: RegimeChiamata): VersoDichiarazione | null {
  if (regime === "indisponibilita") return "non_posso";
  if (regime === "disponibilita") return "posso";
  return null;
}

/** Come si chiama il regime nella schermata delle impostazioni. */
export const ETICHETTA_REGIME: Record<RegimeChiamata, string> = {
  indisponibilita: "Segnala quando non può",
  disponibilita: "Segnala quando può",
  on_demand: "Chiedi ogni volta",
};

export type Dichiarazione = {
  giorno: string; // YYYY-MM-DD
  /** null tutt'e due = tutto il giorno. */
  dalle: string | null; // HH:MM o HH:MM:SS
  alle: string | null;
  verso: VersoDichiarazione;
};

export type TurnoDaAssegnare = {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM o HH:MM:SS
  end_time: string;
};

/* ------------------------------------------------------------- il tempo */

const MINUTI_GIORNO = 1440;

/** "09:30" o "09:30:00" → 570. Gli orari arrivano con i secondi dal
 *  database e senza dall'interfaccia, e qui vale la stessa cosa. */
function minuti(orario: string): number {
  const [h, m] = orario.split(":");
  return Number(h) * 60 + Number(m);
}

/** Il giorno dopo, su una data civile. Non si passa da `Date`: le date a
 *  lunghezza fissa si sommano e si confrontano come stringhe, ed è il
 *  motivo per cui in questa app non c'è un fuso da sbagliare. */
function ilGiornoDopo(iso: string): string {
  const [a, m, g] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + 1));
  return d.toISOString().slice(0, 10);
}

/** Un pezzo di tempo dentro un giorno civile: `[da, a)` in minuti dalla
 *  mezzanotte, con `a` che non supera mai 1440. */
type Pezzo = { giorno: string; da: number; a: number };

/** Da un intervallo con orari ai pezzi che occupa, uno per giorno civile.
 *
 *  `fine <= inizio` vuol dire che scavalca la mezzanotte, ed è la
 *  convenzione di tutta l'app — `durationMinutes` in `lib/date.ts`,
 *  `porzioneDelGiorno` in `supervisione/copertura.ts`. Averne una seconda
 *  solo qui sarebbe il modo migliore di sbagliare i turni di notte, che
 *  sono esattamente quelli per cui si chiama qualcuno. */
function pezziDi(giorno: string, inizio: string, fine: string): Pezzo[] {
  const da = minuti(inizio);
  const a = minuti(fine);
  if (a > da) return [{ giorno, da, a }];
  // A cavallo: la parte prima di mezzanotte resta qui, quella dopo va sul
  // giorno successivo. Se finisce a mezzanotte esatta il secondo pezzo è
  // vuoto e non si aggiunge: un turno che finisce alle 00:00 non tocca il
  // giorno dopo, e segnarcelo lo farebbe sbattere contro le dichiarazioni
  // di una giornata in cui non mette piede.
  const pezzi: Pezzo[] = [{ giorno, da, a: MINUTI_GIORNO }];
  if (a > 0) pezzi.push({ giorno: ilGiornoDopo(giorno), da: 0, a });
  return pezzi;
}

function pezziDelTurno(turno: TurnoDaAssegnare): Pezzo[] {
  return pezziDi(turno.date, turno.start_time, turno.end_time);
}

function pezziDellaDichiarazione(d: Dichiarazione): Pezzo[] {
  if (!d.dalle || !d.alle) {
    return [{ giorno: d.giorno, da: 0, a: MINUTI_GIORNO }];
  }
  return pezziDi(d.giorno, d.dalle, d.alle);
}

/** Gli intervalli di un giorno, uniti. Serve solo alla lista bianca, dove
 *  non basta sapere che c'è una sovrapposizione: serve sapere se il turno è
 *  coperto **per intero**, e due fasce attaccate — 08–12 e 12–18 — coprono
 *  un turno 08–18 che nessuna delle due copre da sola. */
function unisci(pezzi: Pezzo[]): Map<string, { da: number; a: number }[]> {
  const perGiorno = new Map<string, { da: number; a: number }[]>();
  for (const p of pezzi) {
    const lista = perGiorno.get(p.giorno);
    if (lista) lista.push({ da: p.da, a: p.a });
    else perGiorno.set(p.giorno, [{ da: p.da, a: p.a }]);
  }
  for (const [giorno, lista] of perGiorno) {
    lista.sort((x, y) => x.da - y.da);
    const uniti: { da: number; a: number }[] = [];
    for (const x of lista) {
      const ultimo = uniti[uniti.length - 1];
      if (ultimo && x.da <= ultimo.a) ultimo.a = Math.max(ultimo.a, x.a);
      else uniti.push({ ...x });
    }
    perGiorno.set(giorno, uniti);
  }
  return perGiorno;
}

/* -------------------------------------------------------- l'assegnazione */

/** Perché questo turno non si può assegnare. Tre motivi e non uno solo
 *  perché chiedono tre rimedi diversi, e il rimedio è la sola cosa che al
 *  responsabile serva sapere davanti a un rifiuto:
 *
 *  | Motivo | Vuol dire | Si rimedia |
 *  |---|---|---|
 *  | `indisponibile` | ha segnato che quel giorno non può | un altro giorno, o un'altra persona |
 *  | `nessuna_disponibilita` | non ha segnato niente per quel giorno | chiederle se può, e farglielo segnare |
 *  | `fuori_disponibilita` | ha segnato delle ore, ma il turno esce da lì | stringere il turno, o farle allargare la fascia | */
export type MotivoBlocco =
  | "indisponibile"
  | "nessuna_disponibilita"
  | "fuori_disponibilita";

export type EsitoAssegnazione =
  | { ok: true }
  | {
      ok: false;
      motivo: MotivoBlocco;
      /** Il giorno che ha fermato l'assegnazione. Non è sempre quello del
       *  turno: un 22:00–06:00 di venerdì può essere fermato dal sabato, e
       *  dire «venerdì» manderebbe il responsabile a cercare nel posto
       *  sbagliato. */
      giorno: string;
      /** Quello che la persona ha dichiarato per quel giorno, se qualcosa
       *  ha dichiarato: serve a scrivere il messaggio con dentro le ore. */
      fasce: { dalle: string; alle: string }[];
    };

/** Questo turno si può assegnare a questa persona?
 *
 *  Risponde `ok` a tutto ciò che non riguarda: i turni scoperti, chi non è a
 *  chiamata, e il regime `on_demand` — che non ha un calendario da
 *  rispettare ma una domanda da fare, ed è un'altra macchina
 *  (`conseguenzaDelSalvataggio` in `lib/conferme.ts`). */
export function esitoAssegnazione(input: {
  regime: RegimeChiamata;
  /** La persona è a chiamata. Chi ha un monte ore ha già il suo contratto:
   *  mettergli addosso anche questo sarebbe una seconda disciplina sulla
   *  stessa persona. */
  aChiamata: boolean;
  turno: TurnoDaAssegnare;
  /** Le dichiarazioni **di quella persona**, dei giorni toccati dal turno.
   *  Chi chiama ha già filtrato per persona: passargliele tutte vorrebbe
   *  dire che questa funzione debba conoscere l'azienda. */
  dichiarazioni: Dichiarazione[];
}): EsitoAssegnazione {
  const { regime, aChiamata, turno, dichiarazioni } = input;

  const verso = versoDelRegime(regime);
  if (!aChiamata || !verso) return { ok: true };

  const pezziTurno = pezziDelTurno(turno);
  const valide = dichiarazioni.filter((d) => d.verso === verso);

  const dichiarate = unisci(valide.flatMap(pezziDellaDichiarazione));

  if (verso === "non_posso") {
    // Lista nera: basta un minuto in comune. Chi ha detto «il giovedì
    // pomeriggio non ci sono» non ci sarà nemmeno per l'ultima mezz'ora.
    for (const p of pezziTurno) {
      const suoi = dichiarate.get(p.giorno) ?? [];
      const scontro = suoi.find((s) => s.da < p.a && p.da < s.a);
      if (scontro) {
        return {
          ok: false,
          motivo: "indisponibile",
          giorno: p.giorno,
          fasce: fasceDi(valide, p.giorno),
        };
      }
    }
    return { ok: true };
  }

  // Lista bianca: non basta toccarsi, il turno dev'essere coperto **per
  // intero**. Assegnare 17–24 a chi ha detto «dalle 18 posso» vorrebbe dire
  // dare per buona un'ora che non ha mai concesso.
  for (const p of pezziTurno) {
    const suoi = dichiarate.get(p.giorno) ?? [];
    if (suoi.length === 0) {
      return {
        ok: false,
        motivo: "nessuna_disponibilita",
        giorno: p.giorno,
        fasce: [],
      };
    }
    const dentro = suoi.some((s) => s.da <= p.da && p.a <= s.a);
    if (!dentro) {
      return {
        ok: false,
        motivo: "fuori_disponibilita",
        giorno: p.giorno,
        fasce: fasceDi(valide, p.giorno),
      };
    }
  }
  return { ok: true };
}

/** Le fasce dichiarate per un giorno, come le ha scritte la persona — non
 *  unite. Un elenco unito direbbe «08:00–18:00» a chi ha scritto due volte,
 *  e chi legge il messaggio non ritroverebbe le sue parole. */
function fasceDi(
  dichiarazioni: Dichiarazione[],
  giorno: string,
): { dalle: string; alle: string }[] {
  return dichiarazioni
    .filter((d) => d.giorno === giorno && d.dalle && d.alle)
    .map((d) => ({ dalle: d.dalle!.slice(0, 5), alle: d.alle!.slice(0, 5) }));
}

/* ------------------------------------------------------- il calendario */

/** Cosa ha dichiarato una persona per un giorno, nel verso che il regime
 *  legge. `null` = niente, e sotto i due regimi vuol dire il contrario:
 *  nella lista nera è un giorno libero, nella lista bianca è un giorno in
 *  cui non si può assegnare. */
export type StatoGiorno = {
  verso: VersoDichiarazione;
  /** Tutto il giorno: allora le fasce non contano. */
  intero: boolean;
  fasce: { dalle: string; alle: string }[];
};

export function statoDelGiorno(input: {
  regime: RegimeChiamata;
  dichiarazioni: Dichiarazione[];
  giorno: string;
}): StatoGiorno | null {
  const verso = versoDelRegime(input.regime);
  if (!verso) return null;

  const del = input.dichiarazioni.filter(
    (d) => d.verso === verso && d.giorno === input.giorno,
  );
  if (del.length === 0) return null;

  return {
    verso,
    intero: del.some((d) => !d.dalle || !d.alle),
    fasce: fasceDi(del, input.giorno),
  };
}

/** Come si dice a schermo, in una riga. Il testo cambia col verso perché
 *  cambia il senso: la stessa casella grigia vuol dire «non venire» in un
 *  regime e «puoi venire» nell'altro. */
export function descriviStato(stato: StatoGiorno): string {
  const cosa = stato.verso === "non_posso" ? "Non disponibile" : "Disponibile";
  if (stato.intero || stato.fasce.length === 0) return `${cosa} tutto il giorno`;
  const ore = stato.fasce.map((f) => `${f.dalle}–${f.alle}`).join(", ");
  return `${cosa} ${ore}`;
}

/** Il rifiuto scritto come lo si direbbe a chi ha appena premuto Salva:
 *  cos'è successo, e cosa può farci. */
export function spiegaBlocco(
  esito: Extract<EsitoAssegnazione, { ok: false }>,
  nome: string,
  giornoScritto: string,
): string {
  const ore =
    esito.fasce.length > 0
      ? esito.fasce.map((f) => `${f.dalle}–${f.alle}`).join(", ")
      : null;

  if (esito.motivo === "indisponibile") {
    return (
      `${nome} ha segnato che ${giornoScritto} non è disponibile` +
      `${ore ? ` (${ore})` : ""}: scegli un altro giorno o un'altra persona.`
    );
  }
  if (esito.motivo === "nessuna_disponibilita") {
    return (
      `${nome} non ha dato disponibilità per ${giornoScritto}. ` +
      `Finché non la segna, in quel giorno non le si possono dare turni.`
    );
  }
  return (
    `${nome} ${giornoScritto} è disponibile solo ${ore ?? "in altre ore"}: ` +
    `questo turno esce da lì.`
  );
}

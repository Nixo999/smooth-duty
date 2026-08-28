/** Proposta automatica dei turni di una settimana.
 *
 *  Le fasce di copertura dicono già di quante persone c'è bisogno e quando.
 *  Fin qui il tabellone lo scriveva comunque una persona, riga per riga: qui
 *  si parte da quelle fasce e si propone chi ci va.
 *
 *  **È una proposta, non una pubblicazione.** Non scrive niente: restituisce
 *  i turni che *metterebbe* e — cosa altrettanto importante — quelli che non
 *  è riuscito a coprire, col motivo. Un generatore che riempie il tabellone e
 *  tace su ciò che ha lasciato scoperto è peggio di nessun generatore: il
 *  responsabile lo guarda pieno e smette di controllare.
 *
 *  Funzione pura, come gli altri motori: si prova con
 *  `node --import ./scripts/alias.mjs scripts/prova-generazione.mjs`, senza
 *  browser e senza database.
 *
 *  Le domande su chi c'è e quanti ne servono non hanno una risposta nuova
 *  qui: sono le stesse della Supervisione (`copertura.ts`). Due motori che
 *  contano le presenze in due modi finirebbero per dire che una giornata è
 *  coperta in una pagina e scoperta nell'altra. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";
import {
  esitoAssegnazione,
  type Dichiarazione,
  type RegimeChiamata,
} from "@/lib/disponibilita";
import {
  MINUTI_GIORNO,
  copertura,
  fasceDelGiorno,
  segmentiDelGiorno,
  type FasciaGiorno,
  type FasciaInput,
  type Fetta,
  type PersonaInput,
  type TurnoInput,
} from "@/lib/supervisione/copertura";
import { addDays, weekDaysISO } from "@/lib/week";

/** La stessa granularità delle fette di copertura: contare i buchi con un
 *  passo e proporre i turni con un altro darebbe proposte che non chiudono
 *  esattamente il buco che dicono di chiudere. */
export const PASSO = 15;

/** Sotto le due ore non si chiama nessuno a venire: il buco si allarga fino
 *  a lì, restando dentro la fascia che lo ha chiesto. Senza questa regola un
 *  collega che stacca alle 12:45 su una fascia che finisce alle 13:00
 *  genererebbe un turno da un quarto d'ora, che nessuno scriverebbe a mano. */
export const MINIMO_TURNO = 120;

/** Oltre le otto ore filate il turno si spezza fra due persone. La proposta
 *  automatica non è il posto in cui inventare una giornata da dodici ore. */
export const MASSIMO_TURNO = 480;

/** E spezzarlo non basta: senza un tetto sulla **giornata**, i due pezzi di
 *  una fascia 08:00–22:00 finirebbero tutti e due alla stessa persona, che
 *  non ha nessun turno sovrapposto e magari nemmeno il monte ore pieno. Sono
 *  quattordici ore in un giorno, e nessuno le scriverebbe a mano. */
export const MASSIMO_AL_GIORNO = 600;

/** Fra un turno e quello del giorno dopo ci vogliono undici ore.
 *
 *  Senza questa regola il motore fa una cosa che nessun responsabile
 *  scriverebbe: chi smonta dalla notte alle 10:00 non ha nessun turno
 *  sovrapposto alle 10:00, quindi risulta libero, e si ritrova a incatenare
 *  diciannove ore. È il caso della chiusura seguita dall'apertura.
 *
 *  Vale **solo fra giorni diversi**, di proposito. Nella stessa giornata il
 *  turno spezzato — mattina in sala, sera in sala — è normale nella
 *  ristorazione e nel commercio, ed è una cosa che l'azienda decide, non un
 *  errore da impedire qui. */
export const RIPOSO_MINIMO = 660;

export type PersonaGenerazione = PersonaInput & {
  /** I reparti in cui *può* lavorare. Vuoto insieme a `department_id` = una
   *  squadra senza reparti, e allora vale ovunque: un'azienda che non li usa
   *  non deve ritrovarsi con zero proposte. */
  reparti: string[];
  /** Ore settimanali da contratto. null = a chiamata, nessun tetto. */
  contract_hours: number | null;
  on_call: boolean;
  /** Quello che ha dichiarato, se è a chiamata. Facoltativo perché
   *  l'assenza di dichiarazioni sotto il regime di default non blocca
   *  niente, ed è lo stesso non-cambiamento che ha il database. */
  dichiarazioni?: Dichiarazione[];
};

export type Proposta = {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;
  profile_id: string;
  department_id: string;
  /** Il nome della fascia che ha chiesto questo turno, per poterlo spiegare
   *  a chi guarda l'anteprima: «questo perché la sera vuole due persone». */
  fascia: string;
};

/** Perché un posto è rimasto vuoto. Sono quattro situazioni diverse e
 *  chiedono quattro rimedi diversi: assumere, chiedere una disponibilità,
 *  spostare qualcuno, o firmare uno straordinario. Il motivo si porta
 *  dietro fino alla schermata proprio per questo — «scoperto» e basta
 *  lascerebbe al responsabile il lavoro di capire quale dei quattro. */
export type MotivoScoperto =
  | "nessuno_nel_reparto"
  | "non_disponibile"
  | "tutti_occupati"
  | "oltre_contratto";

export type Scoperto = {
  date: string;
  start_time: string;
  end_time: string;
  department_id: string;
  fascia: string;
  motivo: MotivoScoperto;
};

export type Generazione = { proposte: Proposta[]; scoperti: Scoperto[] };

/* ------------------------------------------------------------------ ore */

/** "00:00", non "24:00": la fine a mezzanotte esatta si scrive come la
 *  scriverebbe una persona, ed è anche l'unica forma che il database accetta
 *  in una colonna `time`. */
function orario(minuti: number): string {
  const m = ((minuti % MINUTI_GIORNO) + MINUTI_GIORNO) % MINUTI_GIORNO;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- posti */

/** Un posto da coprire: un buco, per una persona sola.
 *
 *  `limiteDa`/`limiteA` sono i confini della fascia che lo ha generato: è
 *  fin lì che il turno si può allargare per arrivare al minimo, e non oltre —
 *  allargarlo fuori dalla fascia vorrebbe dire far venire qualcuno in un'ora
 *  in cui l'azienda non ha chiesto nessuno. */
type Posto = {
  giorno: number; // indice 0..6 nella settimana
  departmentId: string;
  da: number; // minuti dalla mezzanotte del giorno `giorno`
  a: number; // può superare 1440: il turno scavalca la mezzanotte
  limiteDa: number;
  limiteA: number;
  fascia: string;
};

/** Le fette in cui manca gente, sciolte in un posto per ogni persona che
 *  manca.
 *
 *  Una fascia che vuole tre persone e ne ha una sola produce **due** posti
 *  sovrapposti, non un posto «da due»: ogni posto diventerà un turno di
 *  qualcuno, e le due persone possono benissimo coprire ore diverse. */
function postiDelleFette(fette: Fetta[]): { da: number; a: number }[] {
  const mancanti = (f: Fetta) => Math.max(0, f.richiesti - f.presenti);
  const massimo = fette.reduce((m, f) => Math.max(m, mancanti(f)), 0);

  const fuori: { da: number; a: number }[] = [];
  for (let livello = 1; livello <= massimo; livello++) {
    let corrente: { da: number; a: number } | null = null;
    for (const f of fette) {
      if (mancanti(f) >= livello) {
        if (corrente && corrente.a === f.da) corrente.a = f.a;
        else {
          corrente = { da: f.da, a: f.a };
          fuori.push(corrente);
        }
      } else {
        corrente = null;
      }
    }
  }
  return fuori;
}

/** La fascia che spiega meglio questo buco: quella che ci si sovrappone di
 *  più. Con fasce sovrapposte il nome giusto è quello che il responsabile
 *  riconosce, cioè la fascia in cui il buco sta quasi tutto. */
function fasciaDi(fasce: FasciaGiorno[], da: number, a: number): FasciaGiorno | null {
  let migliore: FasciaGiorno | null = null;
  let piu = 0;
  for (const f of fasce) {
    const insieme = Math.min(f.a, a) - Math.max(f.da, da);
    if (insieme > piu) {
      piu = insieme;
      migliore = f;
    }
  }
  return migliore;
}

/** Fin dove ci si può allargare: l'unione delle fasce che toccano il buco. */
function confini(fasce: FasciaGiorno[], da: number, a: number) {
  let limiteDa = da;
  let limiteA = a;
  for (const f of fasce) {
    if (f.da < a && f.a > da) {
      limiteDa = Math.min(limiteDa, f.da);
      limiteA = Math.max(limiteA, f.a);
    }
  }
  return { limiteDa, limiteA };
}

/** Allarga il posto fino al minimo e lo spezza se supera il massimo. */
function sistema(p: Posto): Posto[] {
  let { da, a } = p;

  if (a - da < MINIMO_TURNO) {
    const manca = MINIMO_TURNO - (a - da);
    // Prima all'indietro: chi copre un buco preferisce attaccarlo prima e
    // andare a casa all'ora prevista, invece di restare oltre.
    const indietro = Math.min(manca, da - p.limiteDa);
    da -= indietro;
    a += Math.min(manca - indietro, p.limiteA - a);
  }

  const durata = a - da;
  if (durata <= MASSIMO_TURNO) return [{ ...p, da, a }];

  const pezzi = Math.ceil(durata / MASSIMO_TURNO);
  const passo = Math.ceil(durata / pezzi / PASSO) * PASSO;
  const fuori: Posto[] = [];
  for (let t = da; t < a; t += passo) {
    fuori.push({ ...p, da: t, a: Math.min(t + passo, a) });
  }
  return fuori;
}

/** I posti che finiscono a mezzanotte e quelli che cominciano a mezzanotte
 *  il giorno dopo, nello stesso reparto, sono **lo stesso turno**.
 *
 *  Per la copertura un 18:00–02:00 è due pezzi, uno per giorno, ed è giusto
 *  così: chi guarda martedì deve vedere che all'una di notte c'è qualcuno.
 *  Ma il turno da proporre è uno: spezzandolo si darebbe la sera a una
 *  persona e la notte a un'altra, e nessuno le ha chiamate per quello. */
function unisciLaNotte(perGiorno: Posto[][]): Posto[] {
  for (let i = 0; i < perGiorno.length - 1; i++) {
    const finiscono = perGiorno[i].filter((p) => p.a === MINUTI_GIORNO);
    for (const sera of finiscono) {
      const notte = perGiorno[i + 1].find(
        (p) => p.da === 0 && p.departmentId === sera.departmentId,
      );
      if (!notte) continue;
      sera.a = MINUTI_GIORNO + notte.a;
      sera.limiteA = MINUTI_GIORNO + notte.limiteA;
      perGiorno[i + 1] = perGiorno[i + 1].filter((p) => p !== notte);
    }
  }
  // La domenica sera che scavalca finisce nel lunedì della settimana dopo,
  // che qui non c'è: resta un turno che chiude alle 24:00.
  return perGiorno.flat();
}

/* ------------------------------------------------------------ chi ci va */

/** Minuti dal lunedì 00:00 della settimana. `giorno` è l'indice del giorno in
 *  cui il turno **comincia** (−1 = la domenica prima), e serve a distinguere
 *  il turno spezzato — stessa giornata, permesso — dalla chiusura seguita
 *  dall'apertura. */
type Impegno = { giorno: number; da: number; a: number };

function sovrapposti(a: Impegno, b: Impegno) {
  return a.da < b.a && a.a > b.da;
}

function riposoRispettato(preso: Impegno, nuovo: Impegno) {
  if (preso.giorno === nuovo.giorno) return true;
  return nuovo.da - preso.a >= RIPOSO_MINIMO || preso.da - nuovo.a >= RIPOSO_MINIMO;
}

/* ------------------------------------------------------------- il motore */

export function generaTurni(input: {
  /** Il lunedì della settimana da riempire, YYYY-MM-DD. */
  lunedi: string;
  /** Le persone fra cui scegliere: solo quelle attive, il filtro non è qui. */
  persone: PersonaGenerazione[];
  fasce: FasciaInput[];
  /** I turni già scritti, compresi quelli della domenica precedente: un
   *  22:00–06:00 di domenica occupa il lunedì mattina di chi lo fa. */
  turni: TurnoInput[];
  assenze: AssenzaInput[];
  /** Come l'azienda ingaggia chi è a chiamata. Il default è quello che non
   *  cambia niente: senza dichiarazioni la lista nera non blocca nessuno. */
  regime?: RegimeChiamata;
}): Generazione {
  const { lunedi, persone, fasce, turni, assenze } = input;
  const regime = input.regime ?? "indisponibilita";
  const giorni = weekDaysISO(lunedi);
  const primaDelLunedi = addDays(lunedi, -1);

  /* --- i buchi, giorno per giorno e reparto per reparto ----------------- */

  const perGiorno: Posto[][] = giorni.map((giorno, indice) => {
    const segmenti = segmentiDelGiorno(
      turni,
      persone,
      giorno,
      indice === 0 ? primaDelLunedi : giorni[indice - 1],
      assenze,
    );
    const fasceOggi = fasceDelGiorno(fasce, giorno);
    const reparti = [...new Set(fasceOggi.map((f) => f.departmentId))];

    const posti: Posto[] = [];
    for (const reparto of reparti) {
      const fasceReparto = fasceOggi.filter((f) => f.departmentId === reparto);
      const segmentiReparto = segmenti.filter((s) => s.departmentId === reparto);
      const fette = copertura(segmentiReparto, fasceReparto, 0, MINUTI_GIORNO, PASSO);

      for (const buco of postiDelleFette(fette)) {
        const fascia = fasciaDi(fasceReparto, buco.da, buco.a);
        posti.push({
          giorno: indice,
          departmentId: reparto,
          da: buco.da,
          a: buco.a,
          ...confini(fasceReparto, buco.da, buco.a),
          fascia: fascia?.nome ?? "",
        });
      }
    }
    return posti;
  });

  const posti = unisciLaNotte(perGiorno)
    .flatMap(sistema)
    .sort((x, y) => x.giorno - y.giorno || x.da - y.da);

  /* --- chi è già occupato, e quante ore ha già ------------------------- */

  const impegni = new Map<string, Impegno[]>();
  const ore = new Map<string, number>();
  /** Ore già in carico a una persona **in un giorno**, chiave `id|giorno`.
   *  Un turno che scavalca la mezzanotte pesa sul giorno in cui comincia,
   *  come ovunque nell'app. */
  const oreDelGiorno = new Map<string, number>();
  const chiave = (profileId: string, giorno: string) => `${profileId}|${giorno}`;

  for (const t of turni) {
    if (!t.profile_id) continue;
    // Un turno di chi quel giorno è assente non occupa nessuno e non conta
    // ore: resta sul tabellone perché il buco si veda, ma non lo fa nessuno.
    if (assenzaDelGiorno(assenze, t.profile_id, t.date)) continue;

    const indice = giorni.indexOf(t.date);
    const inizio =
      indice >= 0
        ? indice * MINUTI_GIORNO + minuti(t.start_time)
        : t.date === primaDelLunedi
          ? -MINUTI_GIORNO + minuti(t.start_time)
          : null;
    if (inizio === null) continue;

    const durata = durataDi(t.start_time, t.end_time);
    impegni.set(t.profile_id, [
      ...(impegni.get(t.profile_id) ?? []),
      { giorno: indice, da: inizio, a: inizio + durata },
    ]);
    // Le ore del contratto sono quelle della settimana: la domenica prima
    // non ci entra.
    if (indice >= 0) ore.set(t.profile_id, (ore.get(t.profile_id) ?? 0) + durata);
    const k = chiave(t.profile_id, t.date);
    oreDelGiorno.set(k, (oreDelGiorno.get(k) ?? 0) + durata);
  }

  /* --- l'assegnazione -------------------------------------------------- */

  // Ordine stabile: a parità di tutto il resto decide il nome, così due
  // esecuzioni sugli stessi dati danno lo stesso tabellone. Un generatore che
  // propone cose diverse a ogni giro non si riesce né a provare né a fidarsi.
  const inOrdine = [...persone].sort((a, b) => a.full_name.localeCompare(b.full_name));

  const proposte: Proposta[] = [];
  const scoperti: Scoperto[] = [];

  for (const posto of posti) {
    const giorno = giorni[posto.giorno];
    const inizio = posto.giorno * MINUTI_GIORNO + posto.da;
    const quando: Impegno = {
      giorno: posto.giorno,
      da: inizio,
      a: inizio + (posto.a - posto.da),
    };
    const durata = posto.a - posto.da;

    const nelReparto = inOrdine.filter((p) => sapeFare(p, posto.departmentId));
    // Chi è a chiamata ci va solo dove ha detto di poterci andare. Il
    // controllo sta **prima** di quello sugli impegni, non dopo, perché
    // altrimenti «sono tutti occupati» finirebbe per dirsi anche di chi
    // quel giorno non c'è proprio — e i due rimedi sono diversi: uno si
    // risolve spostando un turno, l'altro chiedendo una disponibilità.
    const disponibili = nelReparto.filter(
      (p) =>
        esitoAssegnazione({
          regime,
          aChiamata: p.on_call,
          turno: {
            date: giorno,
            start_time: orario(posto.da),
            end_time: orario(posto.a),
          },
          dichiarazioni: p.dichiarazioni ?? [],
        }).ok,
    );
    const liberi = disponibili.filter((p) => {
      if (assenzaDelGiorno(assenze, p.id, giorno)) return false;
      const presi = impegni.get(p.id) ?? [];
      return !presi.some((i) => sovrapposti(i, quando) || !riposoRispettato(i, quando));
    });
    const nellaGiornata = liberi.filter(
      (p) => (oreDelGiorno.get(chiave(p.id, giorno)) ?? 0) + durata <= MASSIMO_AL_GIORNO,
    );
    const ammessi = nellaGiornata.filter((p) => {
      if (p.contract_hours === null) return true; // a chiamata: nessun tetto
      return (ore.get(p.id) ?? 0) + durata <= p.contract_hours * 60;
    });

    const scelto = ammessi.sort((a, b) => confronta(a, b, posto, ore))[0];

    if (!scelto) {
      scoperti.push({
        date: giorno,
        start_time: orario(posto.da),
        end_time: orario(posto.a),
        department_id: posto.departmentId,
        fascia: posto.fascia,
        motivo:
          nelReparto.length === 0
            ? "nessuno_nel_reparto"
            : disponibili.length === 0
              ? "non_disponibile"
              : nellaGiornata.length === 0
                ? "tutti_occupati"
                : "oltre_contratto",
      });
      continue;
    }

    proposte.push({
      date: giorno,
      start_time: orario(posto.da),
      end_time: orario(posto.a),
      profile_id: scelto.id,
      department_id: posto.departmentId,
      fascia: posto.fascia,
    });
    impegni.set(scelto.id, [...(impegni.get(scelto.id) ?? []), quando]);
    ore.set(scelto.id, (ore.get(scelto.id) ?? 0) + durata);
    const k = chiave(scelto.id, giorno);
    oreDelGiorno.set(k, (oreDelGiorno.get(k) ?? 0) + durata);
  }

  return { proposte, scoperti };
}

/* ------------------------------------------------------------- dettagli */

function minuti(orario: string): number {
  const [h, m] = orario.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Come `durationMinutes` in `lib/date.ts`, senza passare da date-fns: qui
 *  non serve un oggetto Date, e la convenzione è la stessa — fine minore o
 *  uguale all'inizio vuol dire che il turno scavalca la mezzanotte. */
function durataDi(inizio: string, fine: string): number {
  const s = minuti(inizio);
  const e = minuti(fine);
  return e <= s ? e + MINUTI_GIORNO - s : e - s;
}

function sapeFare(p: PersonaGenerazione, reparto: string): boolean {
  if (p.reparti.length > 0) return p.reparti.includes(reparto);
  if (p.department_id) return p.department_id === reparto;
  // Nessun reparto da nessuna parte: l'azienda non li usa, e allora questa
  // persona non è esclusa da niente.
  return true;
}

/** Chi viene prima, e perché.
 *
 *  1. Chi ha un contratto prima di chi è a chiamata. Chiamare qualcuno è una
 *     telefonata e spesso un costo in più: si fa quando le ore già pagate
 *     sono finite.
 *  2. Fra i contrattualizzati, chi è più **sotto** le sue ore. È il numero
 *     rosso che il responsabile guarda nel tabellone, e riempirlo è il primo
 *     motivo per cui sta scrivendo la settimana.
 *  3. Chi ha quel reparto come principale, prima di chi ci va di rinforzo.
 *  4. Chi ha meno ore in settimana, per non caricare sempre gli stessi.
 *  5. Il nome, che non decide niente ma rende ripetibile il risultato. */
function confronta(
  a: PersonaGenerazione,
  b: PersonaGenerazione,
  posto: Posto,
  ore: Map<string, number>,
): number {
  const chiamata = (p: PersonaGenerazione) => (p.contract_hours === null || p.on_call ? 1 : 0);
  if (chiamata(a) !== chiamata(b)) return chiamata(a) - chiamata(b);

  const scarto = (p: PersonaGenerazione) =>
    p.contract_hours === null ? 0 : p.contract_hours * 60 - (ore.get(p.id) ?? 0);
  if (scarto(a) !== scarto(b)) return scarto(b) - scarto(a);

  const suo = (p: PersonaGenerazione) => (p.department_id === posto.departmentId ? 0 : 1);
  if (suo(a) !== suo(b)) return suo(a) - suo(b);

  const fatte = (p: PersonaGenerazione) => ore.get(p.id) ?? 0;
  if (fatte(a) !== fatte(b)) return fatte(a) - fatte(b);

  return a.full_name.localeCompare(b.full_name);
}

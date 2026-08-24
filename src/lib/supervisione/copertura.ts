/** Calcolo di quello che si vede nella pagina Supervisione: le barre di
 *  ciascuno lungo la giornata, e quanto di quella giornata e' coperto.
 *
 *  Tutto in minuti dalla mezzanotte del giorno mostrato. Sono funzioni pure:
 *  si possono provare senza database e senza browser. */

import { assenzaDelGiorno, ETICHETTA, type AssenzaInput } from "@/lib/assenze";

export const MINUTI_GIORNO = 1440;

export type TurnoInput = {
  id: string;
  profile_id: string | null;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM[:SS]
  end_time: string;
  title: string | null;
  department_id: string | null;
};

export type PersonaInput = {
  id: string;
  full_name: string;
  department_id: string | null;
};

export type FasciaInput = {
  id: string;
  department_id: string;
  name: string;
  start_time: string;
  end_time: string;
  required: number;
  weekdays: number[]; // 1 = lunedi ... 7 = domenica
};

export type Segmento = {
  turnoId: string;
  profileId: string | null;
  nome: string;
  departmentId: string | null;
  da: number;
  a: number;
  /** Il turno era gia' cominciato a mezzanotte, o prosegue dopo. */
  daPrima: boolean;
  finoADopo: boolean;
  title: string | null;
  /** La persona e' assente quel giorno: il turno si vede ma non conta.
   *  Contiene il motivo, per poterlo scrivere accanto alla barra. */
  assenza: { tipo: string | null; etichetta: string } | null;
};

export type FasciaGiorno = {
  id: string;
  departmentId: string;
  nome: string;
  da: number;
  a: number;
  richiesti: number;
  daPrima: boolean;
};

/* ------------------------------------------------------------------ ore */

export function minutiDa(orario: string): number {
  const [h, m] = orario.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function oraDa(minuti: number): string {
  if (minuti >= MINUTI_GIORNO) return "24:00";
  const m = ((minuti % MINUTI_GIORNO) + MINUTI_GIORNO) % MINUTI_GIORNO;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Un intervallo che scavalca la mezzanotte, riportato sull'asse del giorno
 *  mostrato. Restituisce null se in quel giorno non c'e' niente da disegnare.
 *
 *  Il caso che rende necessaria questa funzione: un turno 18:00-02:00 non e'
 *  un turno solo. E' due pezzi, uno per ciascuno dei due giorni, e chi guarda
 *  il secondo giorno deve vedere che alle 00:30 c'e' gia' qualcuno dentro. */
function porzioneDelGiorno(
  inizio: string,
  fine: string,
  iniziaOggi: boolean,
): { da: number; a: number; daPrima: boolean; finoADopo: boolean } | null {
  const s = minutiDa(inizio);
  const grezzo = minutiDa(fine);
  const scavalca = grezzo <= s;
  const e = scavalca ? grezzo + MINUTI_GIORNO : grezzo;

  if (iniziaOggi) {
    return {
      da: s,
      a: Math.min(e, MINUTI_GIORNO),
      daPrima: false,
      finoADopo: e > MINUTI_GIORNO,
    };
  }

  // Cominciato ieri: oggi si vede solo la coda dopo la mezzanotte.
  if (!scavalca) return null;
  const coda = e - MINUTI_GIORNO;
  if (coda <= 0) return null;
  return { da: 0, a: coda, daPrima: true, finoADopo: false };
}

/* ------------------------------------------------------------- segmenti */

export function segmentiDelGiorno(
  turni: TurnoInput[],
  persone: PersonaInput[],
  giorno: string,
  giornoPrima: string,
  assenze: AssenzaInput[] = [],
): Segmento[] {
  const perId = new Map(persone.map((p) => [p.id, p]));
  const fuori: Segmento[] = [];

  for (const t of turni) {
    const iniziaOggi = t.date === giorno;
    if (!iniziaOggi && t.date !== giornoPrima) continue;

    const porzione = porzioneDelGiorno(t.start_time, t.end_time, iniziaOggi);
    if (!porzione || porzione.a <= porzione.da) continue;

    const persona = t.profile_id ? perId.get(t.profile_id) : undefined;

    // L'assenza si valuta sul giorno del turno, non su quello mostrato: un
    // turno di notte iniziato ieri resta annullato dall'assenza di ieri.
    const assente = assenzaDelGiorno(assenze, t.profile_id, t.date);

    fuori.push({
      turnoId: t.id,
      profileId: t.profile_id,
      nome: persona?.full_name ?? "Da assegnare",
      // Il reparto scritto sul turno vince su quello della persona: serve a
      // dire "oggi copre in sala" senza spostarla di reparto.
      departmentId: t.department_id ?? persona?.department_id ?? null,
      da: porzione.da,
      a: porzione.a,
      daPrima: porzione.daPrima,
      finoADopo: porzione.finoADopo,
      title: t.title,
      assenza: assente
        ? { tipo: assente.type ?? null, etichetta: ETICHETTA(assente.type) }
        : null,
    });
  }

  return fuori.sort((x, y) => x.da - y.da || x.nome.localeCompare(y.nome));
}

/* --------------------------------------------------------------- fasce */

/** Giorno della settimana secondo ISO: 1 lunedi ... 7 domenica. */
export function giornoIso(giorno: string): number {
  const [y, m, d] = giorno.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return n === 0 ? 7 : n;
}

export function fasceDelGiorno(fasce: FasciaInput[], giorno: string): FasciaGiorno[] {
  const oggi = giornoIso(giorno);
  const ieri = oggi === 1 ? 7 : oggi - 1;
  const fuori: FasciaGiorno[] = [];

  for (const f of fasce) {
    for (const iniziaOggi of [true, false]) {
      const valeIn = iniziaOggi ? oggi : ieri;
      if (!f.weekdays.includes(valeIn)) continue;

      const porzione = porzioneDelGiorno(f.start_time, f.end_time, iniziaOggi);
      if (!porzione || porzione.a <= porzione.da) continue;

      fuori.push({
        id: f.id,
        departmentId: f.department_id,
        nome: f.name,
        da: porzione.da,
        a: porzione.a,
        richiesti: f.required,
        daPrima: porzione.daPrima,
      });
    }
  }

  return fuori.sort((x, y) => x.da - y.da);
}

/* ------------------------------------------------------------ copertura */

export type Fetta = { da: number; a: number; presenti: number; richiesti: number };

export type Buco = { da: number; a: number; presenti: number; richiesti: number };

/** Quante persone ci sono e quante ne servono, fetta per fetta.
 *
 *  Non contano come presenze ne' i turni non assegnati ne' quelli di chi e'
 *  assente: sono entrambi il buco che stiamo cercando, contarli lo
 *  nasconderebbe proprio a chi deve rimediare. */
export function copertura(
  segmenti: Segmento[],
  fasce: FasciaGiorno[],
  da: number,
  a: number,
  passo = 15,
): Fetta[] {
  const fette: Fetta[] = [];

  for (let t = da; t < a; t += passo) {
    const fine = Math.min(t + passo, a);

    const presenti = new Set(
      segmenti
        .filter((s) => s.profileId && !s.assenza && s.da < fine && s.a > t)
        .map((s) => s.profileId as string),
    ).size;

    // Fasce sovrapposte: vale la piu' esigente. Non dovrebbero sovrapporsi,
    // ma se capita e' meglio chiedere troppo che accorgersi troppo tardi.
    const richiesti = fasce
      .filter((f) => f.da < fine && f.a > t)
      .reduce((max, f) => Math.max(max, f.richiesti), 0);

    fette.push({ da: t, a: fine, presenti, richiesti });
  }

  return fette;
}

/** Le fette scoperte, unite quando si toccano: una riga sola per un buco di
 *  un'ora, invece di quattro righe da un quarto d'ora.
 *
 *  Si uniscono solo le fette che dicono la stessa cosa. Unendo anche quelle
 *  con presenze diverse e riportando la peggiore, un buco "22:30–23:30, non
 *  c'e' nessuno" nasconderebbe che fino alle 23:00 una persona c'era: e' il
 *  numero su cui il responsabile decide se chiamare qualcuno, e va esatto. */
export function buchi(fette: Fetta[]): Buco[] {
  const fuori: Buco[] = [];

  for (const f of fette) {
    if (f.richiesti === 0 || f.presenti >= f.richiesti) continue;

    const ultimo = fuori[fuori.length - 1];
    if (
      ultimo &&
      ultimo.a === f.da &&
      ultimo.presenti === f.presenti &&
      ultimo.richiesti === f.richiesti
    ) {
      ultimo.a = f.a;
    } else {
      fuori.push({ da: f.da, a: f.a, presenti: f.presenti, richiesti: f.richiesti });
    }
  }

  return fuori;
}

/** L'intervallo di ore da disegnare: quanto basta a contenere turni e fasce,
 *  arrotondato all'ora, con un minimo perche' una giornata con un turno solo
 *  non diventi una striscia illeggibile. */
export function intervalloVisibile(
  segmenti: Segmento[],
  fasce: FasciaGiorno[],
  minimoOre = 6,
): { da: number; a: number } {
  const punti = [...segmenti, ...fasce];
  if (punti.length === 0) return { da: 8 * 60, a: 20 * 60 };

  let da = Math.min(...punti.map((p) => p.da));
  let a = Math.max(...punti.map((p) => p.a));

  da = Math.max(0, Math.floor(da / 60) * 60);
  a = Math.min(MINUTI_GIORNO, Math.ceil(a / 60) * 60);

  const minimo = minimoOre * 60;
  if (a - da < minimo) {
    const manca = minimo - (a - da);
    da = Math.max(0, da - Math.floor(manca / 2));
    a = Math.min(MINUTI_GIORNO, da + minimo);
    if (a - da < minimo) da = Math.max(0, a - minimo);
  }

  return { da, a };
}

/** Tinta stabile per persona: lo stesso nome ha sempre lo stesso colore,
 *  anche fra un giorno e l'altro. */
export function tintaDa(chiave: string): number {
  let h = 0;
  for (let i = 0; i < chiave.length; i++) {
    h = (h * 31 + chiave.charCodeAt(i)) % 360;
  }
  // I gialli fra 50 e 72 gradi diventano illeggibili con testo scuro sopra.
  return h >= 50 && h <= 72 ? (h + 40) % 360 : h;
}

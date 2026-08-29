/** Il prospetto del responsabile: quanto ha lavorato ciascuno, quanto ha
 *  perso per assenza e per quale motivo.
 *
 *  Funzioni pure, provabili senza database e senza browser. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";
import { siLavoreraDavvero } from "@/lib/ore-effettive";

export type Livello = "settimana" | "mese" | "anno";

export type PersonaProspetto = {
  id: string;
  full_name: string;
  department_id: string | null;
  contract_hours: number | null;
  on_call: boolean;
};

export type TurnoProspetto = {
  profile_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  /** Valorizzata = la persona ha detto di no, e quelle ore non le farà.
   *  Vedi `lib/ore-effettive.ts`. */
  rifiutato_at?: string | null;
};

export type RepartoProspetto = { id: string; name: string; hue: number };

export type Totali = {
  /** Quanto era stato messo a tabellone. */
  programmati: number;
  /** Le ore che l'assenza e' costata, contate sul contratto. Non e' un pezzo
   *  di `programmati`: mancano anche le ore che a tabellone non erano mai
   *  state scritte. */
  persi: number;
  /** Quante ore di turno già scritte sono saltate: è quello che il
   *  responsabile deve ricoprire, ed è un numero diverso dalle ore perse. */
  saltati: number;
  /** Quello che resta: le ore che verranno lavorate davvero — la stessa
   *  domanda del monte ore a tabellone e del totale sul telefono del
   *  dipendente (`lib/ore-effettive.ts`).
   *
   *  Non è `programmati - saltati`: fuori restano anche i turni che la
   *  persona ha rifiutato, che a tabellone ci sono ancora ma non li farà
   *  nessuno. */
  effettivi: number;
  /** Ore attese dal contratto nel periodo. null se nessuno le ha. */
  attesi: number | null;
};

export type RigaProspetto = {
  profileId: string;
  nome: string;
  reparto: string | null;
  tinta: number;
  contratto: number | null;
  aChiamata: boolean;
  totali: Totali;
  /** Ore di assenza per causale, in minuti. Si contano sul contratto, non
   *  sul tabellone: chi ha 40 ore a settimana e in quella settimana ne
   *  lavora 10 perché è stato in malattia ne perde 30, che il turno di quei
   *  giorni fosse scritto o no. Il come sta in `calcolaProspetto`. */
  perCausale: Record<string, number>;
  /** Giorni di calendario coperti da un'assenza, per causale. Serve a dire
   *  "sette giorni di malattia", che è un numero diverso dalle ore. */
  giorniPerCausale: Record<string, number>;
  giorniAssenza: number;
  /** Turni saltati: quelli che il responsabile deve coprire. */
  turniSaltati: number;
};

export type Prospetto = {
  giorni: number;
  righe: RigaProspetto[];
  totale: Totali;
  /** Turni di nessuno: non appartengono a una persona ma vanno pur coperti. */
  scopertiMinuti: number;
  /** Le causali che compaiono nel periodo, una colonna per ciascuna.
   *  «malattia» c'è sempre, anche a zero: è la voce che si va a cercare. */
  causali: string[];
  totalePerCausale: Record<string, number>;
  totaleAssenze: number;
};

/** Sempre in tabella, anche quando nessuno si è ammalato: una colonna che
 *  sparisce a seconda del mese rende impossibile confrontare due periodi. */
export const CAUSALE_SEMPRE = "malattia";

function minuti(inizio: string, fine: string): number {
  const [sh, sm] = inizio.split(":").map(Number);
  const [eh, em] = fine.split(":").map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  // Fine minore o uguale all'inizio: il turno scavalca la mezzanotte.
  if (d <= 0) d += 1440;
  return d;
}

export function giorniDelPeriodo(da: string, a: string): string[] {
  const giorni: string[] = [];
  const d = new Date(`${da}T12:00:00`);
  const fine = new Date(`${a}T12:00:00`);
  while (d <= fine) {
    giorni.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() + 1);
  }
  return giorni;
}

const vuoti = (): Totali => ({
  programmati: 0,
  persi: 0,
  saltati: 0,
  effettivi: 0,
  attesi: null,
});

/** Il lunedi' della settimana che contiene questa data.
 *
 *  Si fa a mano invece di chiamare `@/lib/week`: questo file resta senza
 *  dipendenze e senza fusi orari. Mezzogiorno UTC perche' a mezzanotte
 *  un'ora avanti o indietro cambierebbe il giorno. */
function lunediDi(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Quanto pesa una settimana nel conto: i suoi giorni che cadono dentro il
 *  periodo, quanto ci si e' lavorato, e quanti giorni di assenza ci sono
 *  stati causale per causale. */
type Settimana = {
  giorni: number;
  lavorate: number;
  giorniPerCausale: Record<string, number>;
};

const somma = (r: Record<string, number>) =>
  Object.values(r).reduce((n, m) => n + m, 0);

export function calcolaProspetto({
  da,
  a,
  persone,
  reparti,
  turni,
  assenze,
}: {
  da: string;
  a: string;
  persone: PersonaProspetto[];
  reparti: RepartoProspetto[];
  turni: TurnoProspetto[];
  assenze: AssenzaInput[];
}): Prospetto {
  const giorni = giorniDelPeriodo(da, a);
  const nomeReparto = new Map(reparti.map((r) => [r.id, r]));

  const righe = new Map<string, RigaProspetto>();
  for (const p of persone) {
    // Le ore da contratto sono settimanali: su un periodo diverso da sette
    // giorni si riproporzionano. Su una settimana il conto torna esatto, su
    // un mese o un anno e' un'attesa, non un obbligo — e cosi' va letta.
    const attesi =
      p.on_call || p.contract_hours === null
        ? null
        : (Number(p.contract_hours) * 60 * giorni.length) / 7;

    const reparto = p.department_id ? nomeReparto.get(p.department_id) : undefined;

    righe.set(p.id, {
      profileId: p.id,
      nome: p.full_name,
      // Il reparto non raggruppa piu' la tabella, ma resta scritto accanto al
      // nome: senza, in trenta persone non si capisce chi fa cosa.
      reparto: reparto?.name ?? null,
      tinta: reparto?.hue ?? 220,
      contratto: p.contract_hours === null ? null : Number(p.contract_hours),
      aChiamata: p.on_call,
      totali: { ...vuoti(), attesi },
      perCausale: {},
      giorniPerCausale: {},
      giorniAssenza: 0,
      turniSaltati: 0,
    });
  }

  let scopertiMinuti = 0;

  /** Minuti lavorati davvero, giorno per giorno: e' quello che il conto
   *  settimanale sottrae dal contratto. */
  const lavorate = new Map<string, Map<string, number>>();
  /** Ore di turno saltate, per causale. Restano il conto buono per chi un
   *  contratto non ce l'ha: a chiamata non c'e' niente da cui sottrarre. */
  const saltatePerCausale = new Map<string, Record<string, number>>();

  for (const t of turni) {
    if (t.date < da || t.date > a) continue;
    const durata = minuti(t.start_time, t.end_time);

    if (!t.profile_id) {
      scopertiMinuti += durata;
      continue;
    }

    const riga = righe.get(t.profile_id);
    if (!riga) continue;

    riga.totali.programmati += durata;

    const assenza = assenzaDelGiorno(assenze, t.profile_id, t.date);
    if (assenza) {
      riga.totali.saltati += durata;
      riga.turniSaltati += 1;
      const causale = assenza.type ?? "altro";
      const suo = saltatePerCausale.get(t.profile_id) ?? {};
      suo[causale] = (suo[causale] ?? 0) + durata;
      saltatePerCausale.set(t.profile_id, suo);
    } else if (siLavoreraDavvero(t, assenze)) {
      riga.totali.effettivi += durata;
      const suoi = lavorate.get(t.profile_id) ?? new Map<string, number>();
      suoi.set(t.date, (suoi.get(t.date) ?? 0) + durata);
      lavorate.set(t.profile_id, suoi);
    }
    // Rimane fuori il turno rifiutato: sta ancora a tabellone (e infatti
    // resta fra i `programmati`), ma non lo farà nessuno. Contarlo qui
    // dava un numero diverso da quello che la stessa persona legge sul
    // telefono per la stessa settimana.
  }

  /* ------------------------------------------------- quanto e' costata --
   *
   *  Un'assenza costa le ore da contratto che quella settimana non sono
   *  state lavorate, non i turni che erano stati scritti: chi sta a casa
   *  cinque giorni su sette e negli altri due fa dieci ore, di quaranta ne
   *  perde trenta — e il tabellone di quei cinque giorni poteva benissimo
   *  essere vuoto, com'e' quasi sempre per una malattia che comincia il
   *  lunedi'. Il conto e' settimanale perche' settimanale e' il contratto;
   *  delle settimane a cavallo del periodo si conta la parte dentro. */

  for (const riga of righe.values()) {
    const settimane = new Map<string, Settimana>();
    const sue = lavorate.get(riga.profileId);

    for (const g of giorni) {
      const chiave = lunediDi(g);
      let sett = settimane.get(chiave);
      if (!sett) {
        sett = { giorni: 0, lavorate: 0, giorniPerCausale: {} };
        settimane.set(chiave, sett);
      }
      sett.giorni += 1;
      sett.lavorate += sue?.get(g) ?? 0;

      const assenza = assenzaDelGiorno(assenze, riga.profileId, g);
      if (!assenza) continue;
      const causale = assenza.type ?? "altro";
      riga.giorniAssenza += 1;
      riga.giorniPerCausale[causale] = (riga.giorniPerCausale[causale] ?? 0) + 1;
      sett.giorniPerCausale[causale] = (sett.giorniPerCausale[causale] ?? 0) + 1;
    }

    if (riga.giorniAssenza === 0) continue;

    if (riga.contratto === null || riga.aChiamata) {
      riga.perCausale = { ...(saltatePerCausale.get(riga.profileId) ?? {}) };
    } else {
      for (const sett of settimane.values()) {
        const giorniAssenti = somma(sett.giorniPerCausale);
        if (giorniAssenti === 0) continue;

        const dovute = (riga.contratto * 60 * sett.giorni) / 7;
        const mancate = dovute - sett.lavorate;
        if (mancate <= 0) continue;

        // Con due causali nella stessa settimana si dividono in proporzione
        // ai giorni: di un giorno di assenza non si sa quante ore avrebbe
        // avuto, quindi non c'e' una ripartizione piu' informata di questa.
        for (const [causale, g] of Object.entries(sett.giorniPerCausale)) {
          riga.perCausale[causale] =
            (riga.perCausale[causale] ?? 0) + (mancate * g) / giorniAssenti;
        }
      }
      for (const causale of Object.keys(riga.perCausale)) {
        riga.perCausale[causale] = Math.round(riga.perCausale[causale]);
      }
    }

    riga.totali.persi = somma(riga.perCausale);
  }

  const elenco = [...righe.values()].sort((x, y) => x.nome.localeCompare(y.nome));

  /* ------------------------------------------------------------ colonne */

  const totalePerCausale: Record<string, number> = { [CAUSALE_SEMPRE]: 0 };
  for (const r of elenco) {
    for (const [causale, m] of Object.entries(r.perCausale)) {
      totalePerCausale[causale] = (totalePerCausale[causale] ?? 0) + m;
    }
    // Anche una causale con zero ore merita la colonna, se qualcuno l'ha
    // avuta: sono i permessi presi in un giorno di riposo, e vederli a zero
    // dice qualcosa (che non sono costati ore) invece di nascondere il fatto.
    for (const causale of Object.keys(r.giorniPerCausale)) {
      totalePerCausale[causale] = totalePerCausale[causale] ?? 0;
    }
  }

  const causali = Object.keys(totalePerCausale).sort((x, y) => {
    if (x === CAUSALE_SEMPRE) return -1;
    if (y === CAUSALE_SEMPRE) return 1;
    return totalePerCausale[y] - totalePerCausale[x] || x.localeCompare(y);
  });

  const totale = vuoti();
  for (const r of elenco) {
    totale.programmati += r.totali.programmati;
    totale.persi += r.totali.persi;
    totale.saltati += r.totali.saltati;
    totale.effettivi += r.totali.effettivi;
    if (r.totali.attesi !== null) {
      totale.attesi = (totale.attesi ?? 0) + r.totali.attesi;
    }
  }

  return {
    giorni: giorni.length,
    righe: elenco,
    totale,
    scopertiMinuti,
    causali,
    totalePerCausale,
    totaleAssenze: Object.values(totalePerCausale).reduce((n, m) => n + m, 0),
  };
}

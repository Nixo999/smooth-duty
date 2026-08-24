/** Il prospetto del responsabile: quanto ha lavorato ciascuno, quanto ha
 *  perso per assenza e per quale motivo.
 *
 *  Funzioni pure, provabili senza database e senza browser. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";

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
};

export type RepartoProspetto = { id: string; name: string; hue: number };

export type Totali = {
  /** Quanto era stato messo a tabellone. */
  programmati: number;
  /** Quanto di quello è saltato per un'assenza. */
  persi: number;
  /** Quello che resta: le ore che verranno lavorate davvero. */
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
  /** Ore di assenza per causale, in minuti. Sono le ore di turno che quel
   *  giorno sarebbero state lavorate: chi è assente in un giorno di riposo
   *  non perde ore, e qui non compare. */
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

const vuoti = (): Totali => ({ programmati: 0, persi: 0, effettivi: 0, attesi: null });

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
      totali: { programmati: 0, persi: 0, effettivi: 0, attesi },
      perCausale: {},
      giorniPerCausale: {},
      giorniAssenza: 0,
      turniSaltati: 0,
    });
  }

  let scopertiMinuti = 0;

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
      riga.totali.persi += durata;
      riga.turniSaltati += 1;
      const causale = assenza.type ?? "altro";
      riga.perCausale[causale] = (riga.perCausale[causale] ?? 0) + durata;
    } else {
      riga.totali.effettivi += durata;
    }
  }

  for (const riga of righe.values()) {
    for (const g of giorni) {
      const assenza = assenzaDelGiorno(assenze, riga.profileId, g);
      if (!assenza) continue;
      riga.giorniAssenza += 1;
      const causale = assenza.type ?? "altro";
      riga.giorniPerCausale[causale] = (riga.giorniPerCausale[causale] ?? 0) + 1;
    }
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

/** Il prospetto del responsabile: quanto ha lavorato ciascuno, quanto il
 *  reparto, quanto l'azienda.
 *
 *  Funzioni pure, provabili senza database e senza browser. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";

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
  contratto: number | null;
  aChiamata: boolean;
  totali: Totali;
  /** Giorni di calendario coperti da un'assenza, per causale. */
  assenzePerCausale: { causale: string; giorni: number }[];
  giorniAssenza: number;
  /** Giorni in cui un turno è saltato: quelli che il responsabile deve coprire. */
  turniSaltati: number;
};

export type GruppoProspetto = {
  repartoId: string | null;
  nome: string;
  tinta: number;
  righe: RigaProspetto[];
  totali: Totali;
};

export type Prospetto = {
  giorni: number;
  gruppi: GruppoProspetto[];
  totale: Totali;
  /** Turni di nessuno: non appartengono a una persona ma vanno pur coperti. */
  scopertiMinuti: number;
};

export const SENZA_REPARTO = "__senza__";

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

function somma(dentro: Totali, riga: Totali) {
  dentro.programmati += riga.programmati;
  dentro.persi += riga.persi;
  dentro.effettivi += riga.effettivi;
  if (riga.attesi !== null) dentro.attesi = (dentro.attesi ?? 0) + riga.attesi;
}

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

  const righe = new Map<string, RigaProspetto>();
  for (const p of persone) {
    // Le ore da contratto sono settimanali: su un periodo diverso da sette
    // giorni si riproporzionano. Su una settimana il conto torna esatto, su
    // un mese e' una attesa, non un obbligo — ed e' cosi' che va letta.
    const attesi =
      p.on_call || p.contract_hours === null
        ? null
        : (Number(p.contract_hours) * 60 * giorni.length) / 7;

    righe.set(p.id, {
      profileId: p.id,
      nome: p.full_name,
      contratto: p.contract_hours === null ? null : Number(p.contract_hours),
      aChiamata: p.on_call,
      totali: { programmati: 0, persi: 0, effettivi: 0, attesi },
      assenzePerCausale: [],
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
    if (assenzaDelGiorno(assenze, t.profile_id, t.date)) {
      riga.totali.persi += durata;
      riga.turniSaltati += 1;
    } else {
      riga.totali.effettivi += durata;
    }
  }

  // Giorni di calendario coperti da un'assenza: e' il numero che serve per
  // dire "sette giorni di malattia", diverso dai turni saltati.
  for (const riga of righe.values()) {
    const perCausale = new Map<string, number>();
    for (const g of giorni) {
      const assenza = assenzaDelGiorno(assenze, riga.profileId, g);
      if (!assenza) continue;
      riga.giorniAssenza += 1;
      const causale = assenza.type ?? "altro";
      perCausale.set(causale, (perCausale.get(causale) ?? 0) + 1);
    }
    riga.assenzePerCausale = [...perCausale]
      .map(([causale, giorni]) => ({ causale, giorni }))
      .sort((x, y) => y.giorni - x.giorni);
  }

  const perReparto = new Map<string, PersonaProspetto[]>();
  for (const p of persone) {
    const chiave = p.department_id ?? SENZA_REPARTO;
    const elenco = perReparto.get(chiave);
    if (elenco) elenco.push(p);
    else perReparto.set(chiave, [p]);
  }

  const elencoReparti: { id: string; nome: string; tinta: number }[] = [
    ...reparti.map((r) => ({ id: r.id, nome: r.name, tinta: r.hue })),
    ...(perReparto.has(SENZA_REPARTO)
      ? [{ id: SENZA_REPARTO, nome: "Senza reparto", tinta: 220 }]
      : []),
  ];

  const totale = vuoti();
  const gruppi: GruppoProspetto[] = [];

  for (const reparto of elencoReparti) {
    const sue = (perReparto.get(reparto.id) ?? [])
      .map((p) => righe.get(p.id)!)
      .filter(Boolean)
      .sort((x, y) => x.nome.localeCompare(y.nome));

    const totaliReparto = vuoti();
    for (const r of sue) somma(totaliReparto, r.totali);
    somma(totale, totaliReparto);

    gruppi.push({
      repartoId: reparto.id === SENZA_REPARTO ? null : reparto.id,
      nome: reparto.nome,
      tinta: reparto.tinta,
      righe: sue,
      totali: totaliReparto,
    });
  }

  return { giorni: giorni.length, gruppi, totale, scopertiMinuti };
}

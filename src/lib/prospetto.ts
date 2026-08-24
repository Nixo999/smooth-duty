/** Il prospetto del responsabile: quanto ha lavorato ciascuno, e che cosa
 *  manca, su una settimana, un mese o un anno.
 *
 *  Il conto si fa sul server: un anno di turni sono migliaia di righe, e
 *  spedirle tutte al browser per farle sommare lì sarebbe mezzo megabyte di
 *  dati per mostrare venti numeri. Sono comunque funzioni pure, provabili
 *  senza database e senza browser. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  intervalloVisibile,
  segmentiDelGiorno,
  type FasciaInput,
  type TurnoInput,
} from "@/lib/supervisione/copertura";

export type Livello = "settimana" | "mese" | "anno";

export type PersonaInput = {
  id: string;
  full_name: string;
  department_id: string | null;
  contract_hours: number | null;
  on_call: boolean;
};

export type RepartoInput = { id: string; name: string; hue: number };

export type Colonna = { chiave: string; etichetta: string; corta: string };

/** Una mancanza porta con sé giorno e reparto: senza il raggruppamento per
 *  reparto, l'etichetta è l'unico modo per sapere dove manca gente. */
export type Mancanza = {
  giorno: string;
  reparto: string;
  tinta: number;
  da: number;
  a: number;
  presenti: number;
  richiesti: number;
};

export type RigaProspetto = {
  id: string;
  nome: string;
  reparto: string | null;
  tinta: number;
  contratto: number | null;
  aChiamata: boolean;
  /** Minuti lavorati davvero, colonna per colonna. */
  valori: number[];
  minuti: number;
  /** Ore che sarebbero state lavorate se non ci fosse stata un'assenza. */
  minutiPersi: number;
  turniSaltati: number;
  attesi: number | null;
  assenze: { causale: string; giorni: number }[];
  giorniAssenza: number;
};

export type Prospetto = {
  livello: Livello;
  colonne: Colonna[];
  righe: RigaProspetto[];
  /** Minuti scoperti per colonna: è la riga delle mancanze in alto. */
  scopertiPerColonna: number[];
  minutiScoperti: number;
  minutiDaAssegnare: number;
  turniDaAssegnare: number;
  minutiPersi: number;
  giorniConMancanze: number;
  giorni: number;
  /** Giorni senza nemmeno un turno: il tabellone non è ancora stato fatto. */
  giorniSenzaTurni: number;
  mancanze: Mancanza[];
  totali: { minuti: number; attesi: number | null };
};

const MESI_CORTI = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];
const GIORNI_CORTI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function minuti(inizio: string, fine: string): number {
  const [sh, sm] = inizio.split(":").map(Number);
  const [eh, em] = fine.split(":").map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  // Fine minore o uguale all'inizio: il turno scavalca la mezzanotte.
  if (d <= 0) d += 1440;
  return d;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function giorniTra(da: string, a: string): string[] {
  const giorni: string[] = [];
  const d = new Date(`${da}T12:00:00`);
  const fine = new Date(`${a}T12:00:00`);
  while (d <= fine) {
    giorni.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return giorni;
}

function giornoPrimaDi(giorno: string): string {
  const d = new Date(`${giorno}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return iso(d);
}

/** Le colonne del grafico: un giorno ciascuna sulla settimana e sul mese,
 *  un mese ciascuna sull'anno. Sono i tre modi in cui si guarda un andamento
 *  senza contare trecento colonne. */
function colonneDi(livello: Livello, giorni: string[]): Colonna[] {
  if (livello === "anno") {
    const anno = giorni[0].slice(0, 4);
    return Array.from({ length: 12 }, (_, i) => ({
      chiave: `${anno}-${String(i + 1).padStart(2, "0")}`,
      etichetta: MESI[i],
      corta: MESI_CORTI[i],
    }));
  }

  return giorni.map((g) => {
    const d = new Date(`${g}T12:00:00`);
    const settimana = (d.getDay() + 6) % 7;
    return {
      chiave: g,
      etichetta: `${GIORNI_CORTI[settimana]} ${Number(g.slice(8, 10))} ${MESI[Number(g.slice(5, 7)) - 1]}`,
      corta:
        livello === "settimana"
          ? GIORNI_CORTI[settimana]
          : String(Number(g.slice(8, 10))),
    };
  });
}

export function calcolaProspetto({
  livello,
  da,
  a,
  persone,
  reparti,
  turni,
  fasce,
  assenze,
}: {
  livello: Livello;
  da: string;
  a: string;
  persone: PersonaInput[];
  reparti: RepartoInput[];
  turni: TurnoInput[];
  fasce: FasciaInput[];
  assenze: AssenzaInput[];
}): Prospetto {
  const giorni = giorniTra(da, a);
  const colonne = colonneDi(livello, giorni);
  const indice = new Map(colonne.map((c, i) => [c.chiave, i]));
  const chiaveDi = (giorno: string) =>
    livello === "anno" ? giorno.slice(0, 7) : giorno;

  const nomeReparto = new Map(reparti.map((r) => [r.id, r]));

  /* ------------------------------------------------------------- persone */

  const righe = new Map<string, RigaProspetto>();
  for (const p of persone) {
    const reparto = p.department_id ? nomeReparto.get(p.department_id) : undefined;
    righe.set(p.id, {
      id: p.id,
      nome: p.full_name,
      reparto: reparto?.name ?? null,
      tinta: reparto?.hue ?? 220,
      contratto: p.contract_hours === null ? null : Number(p.contract_hours),
      aChiamata: p.on_call,
      valori: new Array(colonne.length).fill(0),
      minuti: 0,
      minutiPersi: 0,
      turniSaltati: 0,
      // Le ore da contratto sono settimanali: sul periodo si riproporzionano.
      // Su una settimana il conto è esatto, su un mese o un anno è un'attesa,
      // non un obbligo contrattuale.
      attesi:
        p.on_call || p.contract_hours === null
          ? null
          : (Number(p.contract_hours) * 60 * giorni.length) / 7,
      assenze: [],
      giorniAssenza: 0,
    });
  }

  let minutiDaAssegnare = 0;
  let turniDaAssegnare = 0;

  for (const t of turni) {
    if (t.date < da || t.date > a) continue;
    const durata = minuti(t.start_time, t.end_time);

    if (!t.profile_id) {
      minutiDaAssegnare += durata;
      turniDaAssegnare += 1;
      continue;
    }

    const riga = righe.get(t.profile_id);
    if (!riga) continue;

    // Le ore di chi è assente non si sommano: il totale deve dire quanto è
    // stato lavorato davvero, non quanto era stato messo in programma.
    if (assenzaDelGiorno(assenze, t.profile_id, t.date)) {
      riga.minutiPersi += durata;
      riga.turniSaltati += 1;
      continue;
    }

    riga.minuti += durata;
    const i = indice.get(chiaveDi(t.date));
    if (i !== undefined) riga.valori[i] += durata;
  }

  // Giorni di calendario coperti da un'assenza: è il numero che serve per
  // dire "sette giorni di malattia", diverso dai turni saltati.
  for (const riga of righe.values()) {
    const perCausale = new Map<string, number>();
    for (const g of giorni) {
      const assenza = assenzaDelGiorno(assenze, riga.id, g);
      if (!assenza) continue;
      riga.giorniAssenza += 1;
      const causale = assenza.type ?? "altro";
      perCausale.set(causale, (perCausale.get(causale) ?? 0) + 1);
    }
    riga.assenze = [...perCausale]
      .map(([causale, giorni]) => ({ causale, giorni }))
      .sort((x, y) => y.giorni - x.giorni);
  }

  /* ------------------------------------------------------------ mancanze */

  const scopertiPerColonna = new Array(colonne.length).fill(0);
  const mancanze: Mancanza[] = [];
  const conTurni = new Set(turni.map((t) => t.date));
  let giorniConMancanze = 0;
  let giorniSenzaTurni = 0;

  for (const giorno of giorni) {
    // Un giorno in cui l'azienda non ha nemmeno un turno non è scoperto: è un
    // giorno di cui il tabellone non è ancora stato fatto. Contarlo come
    // mancanza gonfierebbe il totale annuale di migliaia di ore inventate, e
    // il numero che conta — quanto manca dove si è pianificato — sparirebbe
    // dentro il rumore.
    if (!conTurni.has(giorno)) {
      giorniSenzaTurni += 1;
      continue;
    }

    const segmenti = segmentiDelGiorno(
      turni,
      persone,
      giorno,
      giornoPrimaDi(giorno),
      assenze,
    );
    const fasceOggi = fasceDelGiorno(fasce, giorno);
    const finestra = intervalloVisibile(segmenti, fasceOggi);

    const delGiorno: Mancanza[] = [];
    for (const r of reparti) {
      const sue = fasceOggi.filter((f) => f.departmentId === r.id);
      if (sue.length === 0) continue;

      const suoi = segmenti.filter((s) => s.departmentId === r.id);
      for (const b of calcolaBuchi(
        copertura(suoi, sue, finestra.da, finestra.a),
      )) {
        delGiorno.push({ giorno, reparto: r.name, tinta: r.hue, ...b });
      }
    }

    if (delGiorno.length === 0) continue;

    giorniConMancanze += 1;
    mancanze.push(...delGiorno);
    const i = indice.get(chiaveDi(giorno));
    if (i !== undefined) {
      scopertiPerColonna[i] += delGiorno.reduce((n, b) => n + (b.a - b.da), 0);
    }
  }

  /* -------------------------------------------------------------- totali */

  const elenco = [...righe.values()].sort(
    (x, y) => y.minuti - x.minuti || x.nome.localeCompare(y.nome),
  );

  const totali = elenco.reduce<{ minuti: number; attesi: number | null }>(
    (acc, r) => ({
      minuti: acc.minuti + r.minuti,
      attesi: r.attesi === null ? acc.attesi : (acc.attesi ?? 0) + r.attesi,
    }),
    { minuti: 0, attesi: null },
  );

  return {
    livello,
    colonne,
    righe: elenco,
    scopertiPerColonna,
    minutiScoperti: scopertiPerColonna.reduce((n, m) => n + m, 0),
    minutiDaAssegnare,
    turniDaAssegnare,
    minutiPersi: elenco.reduce((n, r) => n + r.minutiPersi, 0),
    giorniConMancanze,
    giorni: giorni.length,
    giorniSenzaTurni,
    mancanze,
    totali,
  };
}

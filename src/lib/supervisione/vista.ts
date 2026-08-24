/** Quello che la pagina Supervisione mostra, a tre livelli di ingrandimento:
 *  un giorno, un mese, un anno.
 *
 *  Il conto si fa qui e non nel browser: un anno di turni sono migliaia di
 *  righe, e spedirle tutte al telefono per farle sommare lì sarebbe mezzo
 *  megabyte di dati per mostrare venti numeri. */

import { assenzaDelGiorno, ETICHETTA, type AssenzaInput } from "@/lib/assenze";
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  intervalloVisibile,
  segmentiDelGiorno,
  type FasciaInput,
  type PersonaInput,
  type Segmento,
  type TurnoInput,
} from "@/lib/supervisione/copertura";

export type RepartoInput = { id: string; name: string; hue: number };

/** Per il mese e l'anno serve anche il contratto, per dire quanto ci si
 *  aspettava rispetto a quanto è stato messo a tabellone. */
export type PersonaConContratto = PersonaInput & {
  contract_hours: number | null;
  on_call: boolean;
};

/** Un buco porta con sé il reparto e il giorno: tolto il raggruppamento per
 *  reparto, senza l'etichetta non si saprebbe più dove manca gente. */
export type BucoEtichettato = {
  giorno: string;
  reparto: string;
  tinta: number;
  da: number;
  a: number;
  presenti: number;
  richiesti: number;
};

export type PersonaGiorno = {
  id: string;
  nome: string;
  reparto: string | null;
  tinta: number;
  segmenti: Segmento[];
  minuti: number;
  assenza: string | null;
};

export type VistaGiorno = {
  tipo: "giorno";
  finestra: { da: number; a: number };
  persone: PersonaGiorno[];
  buchi: BucoEtichettato[];
  minutiScoperti: number;
  /** Turni che non sono di nessuno: vanno coperti come i buchi. */
  daAssegnare: Segmento[];
};

export type PersonaPeriodo = {
  id: string;
  nome: string;
  reparto: string | null;
  tinta: number;
  /** Minuti lavorati davvero, colonna per colonna (giorni o mesi). */
  valori: number[];
  minuti: number;
  minutiPersi: number;
  attesi: number | null;
  assenze: { causale: string; giorni: number }[];
  turniSaltati: number;
};

export type VistaPeriodo = {
  tipo: "mese" | "anno";
  colonne: { chiave: string; etichetta: string; corta: string }[];
  persone: PersonaPeriodo[];
  /** Minuti scoperti per colonna: è la riga delle mancanze in alto. */
  scopertiPerColonna: number[];
  minutiScoperti: number;
  giorniConBuchi: number;
  giorni: number;
  /** Giorni in cui non c'è nemmeno un turno: il tabellone non è ancora
   *  stato fatto, e chiamarli "scoperti" sarebbe fuorviante. */
  giorniSenzaTurni: number;
  buchi: BucoEtichettato[];
};

export type Vista = VistaGiorno | VistaPeriodo;

const MESI_CORTI = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function durata(inizio: string, fine: string): number {
  const [sh, sm] = inizio.split(":").map(Number);
  const [eh, em] = fine.split(":").map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d <= 0) d += 1440;
  return d;
}

export function giorniTra(da: string, a: string): string[] {
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

const giornoPrimaDi = (giorno: string) => {
  const d = new Date(`${giorno}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** I buchi di una giornata, con il reparto attaccato. Il raggruppamento per
 *  reparto sparisce dallo schermo, non dal calcolo: le regole di copertura
 *  appartengono ai reparti, e senza non si saprebbe quante persone servono. */
function buchiDiUnGiorno(
  giorno: string,
  segmenti: Segmento[],
  fasce: FasciaInput[],
  reparti: RepartoInput[],
  finestra: { da: number; a: number },
): BucoEtichettato[] {
  const fasceOggi = fasceDelGiorno(fasce, giorno);
  const fuori: BucoEtichettato[] = [];

  for (const r of reparti) {
    const sue = fasceOggi.filter((f) => f.departmentId === r.id);
    if (sue.length === 0) continue;

    const suoi = segmenti.filter((s) => s.departmentId === r.id);
    const fette = copertura(suoi, sue, finestra.da, finestra.a);

    for (const b of calcolaBuchi(fette)) {
      fuori.push({ giorno, reparto: r.name, tinta: r.hue, ...b });
    }
  }

  return fuori.sort((x, y) => x.da - y.da);
}

/* ------------------------------------------------------------- un giorno */

export function vistaGiorno({
  giorno,
  turni,
  persone,
  reparti,
  fasce,
  assenze,
}: {
  giorno: string;
  turni: TurnoInput[];
  persone: PersonaInput[];
  reparti: RepartoInput[];
  fasce: FasciaInput[];
  assenze: AssenzaInput[];
}): VistaGiorno {
  const segmenti = segmentiDelGiorno(
    turni,
    persone,
    giorno,
    giornoPrimaDi(giorno),
    assenze,
  );
  const finestra = intervalloVisibile(segmenti, fasceDelGiorno(fasce, giorno));
  const buchi = buchiDiUnGiorno(giorno, segmenti, fasce, reparti, finestra);
  const nomeReparto = new Map(reparti.map((r) => [r.id, r]));

  const righe: PersonaGiorno[] = persone
    .map((p) => {
      const suoi = segmenti.filter((s) => s.profileId === p.id);
      const reparto = p.department_id ? nomeReparto.get(p.department_id) : undefined;
      const assenza = assenzaDelGiorno(assenze, p.id, giorno);

      return {
        id: p.id,
        nome: p.full_name,
        reparto: reparto?.name ?? null,
        tinta: reparto?.hue ?? 220,
        segmenti: suoi,
        minuti: assenza ? 0 : suoi.reduce((n, s) => n + (s.a - s.da), 0),
        assenza: assenza ? ETICHETTA(assenza.type) : null,
      };
    })
    // Prima chi lavora, poi gli assenti, poi chi riposa: l'ordine in cui uno
    // se li chiede guardando la giornata.
    .sort((x, y) => {
      const peso = (r: PersonaGiorno) =>
        r.segmenti.length === 0 ? 2 : r.assenza ? 1 : 0;
      return (
        peso(x) - peso(y) ||
        (x.segmenti[0]?.da ?? 0) - (y.segmenti[0]?.da ?? 0) ||
        x.nome.localeCompare(y.nome)
      );
    });

  return {
    tipo: "giorno",
    finestra,
    persone: righe,
    buchi,
    minutiScoperti: buchi.reduce((n, b) => n + (b.a - b.da), 0),
    daAssegnare: segmenti.filter((s) => s.profileId === null),
  };
}

/* --------------------------------------------------------- mese o anno -- */

export function vistaPeriodo({
  tipo,
  da,
  a,
  turni,
  persone,
  reparti,
  fasce,
  assenze,
}: {
  tipo: "mese" | "anno";
  da: string;
  a: string;
  turni: TurnoInput[];
  persone: PersonaConContratto[];
  reparti: RepartoInput[];
  fasce: FasciaInput[];
  assenze: AssenzaInput[];
}): VistaPeriodo {
  const giorni = giorniTra(da, a);
  const nomeReparto = new Map(reparti.map((r) => [r.id, r]));

  // Nel mese una colonna per giorno, nell'anno una per mese: sono i due modi
  // in cui si guarda un andamento senza contare trecento colonne.
  const colonne =
    tipo === "mese"
      ? giorni.map((g) => ({
          chiave: g,
          etichetta: g,
          corta: String(Number(g.slice(8, 10))),
        }))
      : Array.from({ length: 12 }, (_, i) => ({
          chiave: `${da.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`,
          etichetta: MESI[i],
          corta: MESI_CORTI[i],
        }));

  const indiceColonna = new Map(colonne.map((c, i) => [c.chiave, i]));
  const chiaveDi = (giorno: string) =>
    tipo === "mese" ? giorno : giorno.slice(0, 7);

  const righe = new Map<string, PersonaPeriodo>();
  for (const p of persone) {
    const reparto = p.department_id ? nomeReparto.get(p.department_id) : undefined;
    righe.set(p.id, {
      id: p.id,
      nome: p.full_name,
      reparto: reparto?.name ?? null,
      tinta: reparto?.hue ?? 220,
      valori: new Array(colonne.length).fill(0),
      minuti: 0,
      minutiPersi: 0,
      // Le ore da contratto sono settimanali: sul periodo si riproporzionano.
      // Su un mese è un'attesa, non un obbligo contrattuale.
      attesi:
        p.on_call || p.contract_hours === null
          ? null
          : (Number(p.contract_hours) * 60 * giorni.length) / 7,
      assenze: [],
      turniSaltati: 0,
    });
  }

  for (const t of turni) {
    if (t.date < da || t.date > a || !t.profile_id) continue;
    const riga = righe.get(t.profile_id);
    if (!riga) continue;

    const minuti = durata(t.start_time, t.end_time);
    if (assenzaDelGiorno(assenze, t.profile_id, t.date)) {
      riga.minutiPersi += minuti;
      riga.turniSaltati += 1;
      continue;
    }

    riga.minuti += minuti;
    const i = indiceColonna.get(chiaveDi(t.date));
    if (i !== undefined) riga.valori[i] += minuti;
  }

  for (const riga of righe.values()) {
    const perCausale = new Map<string, number>();
    for (const g of giorni) {
      const assenza = assenzaDelGiorno(assenze, riga.id, g);
      if (!assenza) continue;
      const causale = assenza.type ?? "altro";
      perCausale.set(causale, (perCausale.get(causale) ?? 0) + 1);
    }
    riga.assenze = [...perCausale]
      .map(([causale, giorni]) => ({ causale, giorni }))
      .sort((x, y) => y.giorni - x.giorni);
  }

  // Le mancanze giorno per giorno. È l'unica parte pesante — 96 fette per
  // reparto per giorno — ma gira sul server una volta sola.
  const scopertiPerColonna = new Array(colonne.length).fill(0);
  const buchi: BucoEtichettato[] = [];
  let giorniConBuchi = 0;
  let giorniSenzaTurni = 0;

  const conTurni = new Set(turni.map((t) => t.date));

  for (const giorno of giorni) {
    // Un giorno in cui l'azienda non ha nemmeno un turno non è scoperto: è un
    // giorno di cui il tabellone non è ancora stato fatto. Contarlo come
    // mancanza gonfierebbe il totale annuale di migliaia di ore inventate,
    // e il numero che conta davvero — quanto manca dove si è pianificato —
    // sparirebbe dentro il rumore.
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
    const finestra = intervalloVisibile(segmenti, fasceDelGiorno(fasce, giorno));
    const suoi = buchiDiUnGiorno(giorno, segmenti, fasce, reparti, finestra);
    if (suoi.length === 0) continue;

    giorniConBuchi += 1;
    buchi.push(...suoi);
    const i = indiceColonna.get(chiaveDi(giorno));
    if (i !== undefined) {
      scopertiPerColonna[i] += suoi.reduce((n, b) => n + (b.a - b.da), 0);
    }
  }

  const ordinate = [...righe.values()].sort(
    (x, y) => y.minuti - x.minuti || x.nome.localeCompare(y.nome),
  );

  return {
    tipo,
    colonne,
    persone: ordinate,
    scopertiPerColonna,
    minutiScoperti: scopertiPerColonna.reduce((n, m) => n + m, 0),
    giorniConBuchi,
    giorni: giorni.length,
    giorniSenzaTurni,
    buchi,
  };
}

import type { Shift } from "@/lib/types";

/** Le modifiche in sospeso a un tabellone.
 *
 *  Una settimana pubblicata non si tocca alla leggera: si preme Modifica,
 *  si lavora su una copia locale, e solo «Conferma» spedisce tutto al
 *  server. Questo file è il motore di quella copia: come si accumulano le
 *  operazioni, come si disegna il tabellone come-se, e come si compattano
 *  le operazioni al momento di applicarle. Lo usano i Turni e la
 *  Supervisione: due implementazioni divergerebbero al primo bug. */

/** Un turno come lo maneggia l'editor: orari HH:MM, id provvisorio
 *  (`nuovo:N`) per quelli non ancora nati. */
export type TurnoBozza = {
  id: string;
  profile_id: string | null;
  department_id: string | null;
  date: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  title: string | null;
  location: string | null;
  notes: string | null;
};

export type Operazione =
  | { tipo: "salva"; dopo: TurnoBozza }
  | { tipo: "elimina"; prima: TurnoBozza };

/** Un gesto dell'utente: quasi sempre un'operazione sola, ma «Svuota» ne
 *  fa una per turno. La freccia indietro toglie una mossa intera — chi
 *  svuota e ci ripensa non deve premere trenta volte. A `proietta` e
 *  `compatta` le mosse arrivano appiattite: per loro conta cosa e' successo,
 *  non in quanti gesti. */
export type Mossa = Operazione[];

export function turnoBozzaDa(s: Shift): TurnoBozza {
  return {
    id: s.id,
    profile_id: s.profile_id,
    department_id: s.department_id,
    date: s.date,
    start_time: s.start_time.slice(0, 5),
    end_time: s.end_time.slice(0, 5),
    title: s.title,
    location: s.location,
    notes: s.notes,
  };
}

const nuovo = (id: string) => id.startsWith("nuovo:");

/** Il tabellone come sarebbe con le modifiche applicate. Serve solo a
 *  disegnare: i campi che il server calcola (conferme) restano vuoti. */
export function proietta(base: Shift[], modifiche: Operazione[]): Shift[] {
  const perId = new Map<string, Shift>(base.map((s) => [s.id, s]));
  for (const m of modifiche) {
    if (m.tipo === "elimina") {
      perId.delete(m.prima.id);
      continue;
    }
    const esistente = perId.get(m.dopo.id);
    perId.set(m.dopo.id, {
      // company_id e lo stato dei rifiuti: dal turno vero se c'è, altrimenti
      // vuoti. Sono campi che decide il server a salvataggio avvenuto.
      company_id: esistente?.company_id ?? "",
      richiede_conferma: null,
      confermato_at: null,
      rifiutato_at: null,
      nota_rifiuto: null,
      ...m.dopo,
      start_time: `${m.dopo.start_time}:00`,
      end_time: `${m.dopo.end_time}:00`,
    });
  }
  return [...perId.values()];
}

/** Le operazioni ridotte all'osso: lo stato finale di ogni turno toccato.
 *  Dieci ritocchi allo stesso turno sono un salvataggio solo; un turno
 *  nuovo poi cancellato non è mai esistito. */
export function compatta(modifiche: Operazione[]): {
  daEliminare: string[];
  daSalvare: (TurnoBozza & { creazione: boolean })[];
} {
  const finale = new Map<string, TurnoBozza | null>();
  for (const m of modifiche) {
    if (m.tipo === "salva") finale.set(m.dopo.id, m.dopo);
    else finale.set(m.prima.id, null);
  }

  const daEliminare: string[] = [];
  const daSalvare: (TurnoBozza & { creazione: boolean })[] = [];
  for (const [id, stato] of finale) {
    if (stato === null) {
      if (!nuovo(id)) daEliminare.push(id);
    } else {
      daSalvare.push({ ...stato, creazione: nuovo(id) });
    }
  }
  return { daEliminare, daSalvare };
}

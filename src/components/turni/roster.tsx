"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FileUp,
  PencilLine,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  eliminaTurno,
  eliminaTuttiITurni,
  pubblicaSettimana,
  ripristinaTurni,
  salvaTurno,
} from "@/app/(app)/turni/actions";
import { CopiaDialog } from "@/components/turni/copia-dialog";
import { DisponibilitaGriglia } from "@/components/turni/disponibilita-griglia";
import { StrisciaGiorni } from "@/components/turni/striscia-giorni";
import { Messaggi } from "@/components/turni/messaggi";
import {
  ShiftDialog,
  shiftToDraft,
  type GestoreTurni,
  type ShiftDraft,
} from "@/components/turni/shift-dialog";
import { WeekNav } from "@/components/turni/week-nav";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { GruppoModifica } from "@/components/ui/gruppo-modifica";
import { Ricerca } from "@/components/ui/ricerca";
import {
  ETICHETTA_CONFERMA,
  SPIEGA_CONFERMA,
  statoConferma,
  type StatoConferma,
} from "@/lib/conferme";
import {
  descriviStato,
  statoDelGiorno,
  versoDelRegime,
  type Dichiarazione,
  type RegimeChiamata,
  type StatoGiorno,
} from "@/lib/disponibilita";
import { repartoDelTurno } from "@/lib/reparto";
import {
  compatta,
  proietta,
  turnoBozzaDa,
  type Mossa,
  type TurnoBozza,
} from "@/lib/turni-staging";
import { corrisponde } from "@/lib/ricerca";
import {
  dayLong,
  dayShort,
  durationMinutes,
  formatDuration,
  fromISODate,
  hhmm,
  isToday,
  timeRange,
} from "@/lib/date";
import { assenzaDelGiorno, ETICHETTA } from "@/lib/assenze";
import { siLavoreraDavvero } from "@/lib/ore-effettive";
import { Modal } from "@/components/ui/modal";
import type { SottoContratto } from "@/lib/pubblicazione";
import type {
  Absence,
  Disponibilita,
  Department,
  MessaggioTurno,
  RichiestaSettimana,
  Profile,
  Shift,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const UNASSIGNED = "__scoperti__";

type Riga = {
  id: string;
  name: string;
  unassigned?: boolean;
  /** Ore settimanali da contratto; null per chi è a chiamata o non le ha. */
  contratto: number | null;
  aChiamata: boolean;
  /** Assenza che tocca questa settimana, se c'è. */
  assenza: Absence | null;
  /** A chiamata, part time o full time: dalla scheda della persona. */
  tipoContratto: string | null;
  /** Il reparto della persona: vale per i turni che non ne portano uno loro. */
  repartoPersona: string | null;
  /** Tutti i reparti in cui puo' lavorare, per il filtro. */
  reparti: string[];
};

/** Ore assegnate, e quanto distano da quelle dovute. Il confronto è il motivo
 *  per cui le ore da contratto si inseriscono: senza, sono un dato morto. */
function OreDellaRiga({ minuti, riga }: { minuti: number; riga: Riga }) {
  const ore = minuti / 60;
  const oltre = riga.contratto !== null && ore > riga.contratto + 0.01;
  const sotto = riga.contratto !== null && ore < riga.contratto - 0.01;

  return (
    <p
      className={cn(
        "text-[12px] cifre",
        // Sopra le ore e' un costo (arancio), sotto e' un buco nel
        // contratto (rosso): sono i due numeri che il responsabile cerca.
        oltre ? "text-warning" : sotto ? "text-danger" : "text-faint",
      )}
      title={
        riga.contratto !== null
          ? oltre
            ? "Oltre le ore da contratto"
            : sotto
              ? "Sotto le ore da contratto"
              : "In linea con il contratto"
          : undefined
      }
    >
      {formatDuration(minuti)}
      {riga.aChiamata
        ? " · a chiamata"
        : riga.contratto !== null
          ? ` di ${riga.contratto}h`
          : " · settimana"}
    </p>
  );
}

export function Roster({
  monday,
  days,
  profiles,
  shifts,
  departments,
  assenze,
  repartoFrequente,
  inBozza,
  messaggi,
  risposteSettimana,
  regimeChiamata,
  disponibilita,
}: {
  monday: string;
  days: string[];
  profiles: Profile[];
  shifts: Shift[];
  departments: Department[];
  assenze: Absence[];
  /** Per ciascuna persona, il reparto in cui lavora piu' spesso. */
  repartoFrequente: Record<string, string>;
  /** La settimana e' in bozza: i dipendenti non la vedono. */
  inBozza: boolean;
  /** I rifiuti ancora aperti, di tutte le settimane. */
  messaggi: MessaggioTurno[];
  /** Le risposte alla domanda sulla settimana intera, non ancora lette. */
  risposteSettimana: RichiestaSettimana[];
  /** Come l'azienda ingaggia chi è a chiamata. */
  regimeChiamata: RegimeChiamata;
  /** Quello che le persone a chiamata hanno dichiarato per questa settimana.
   *  Vuoto sotto `on_demand`, dove il calendario non esiste. */
  disponibilita: Disponibilita[];
}) {
  const router = useRouter();
  const [inLavoro, startLavoro] = React.useTransition();

  /** Chi sta sotto le sue ore da contratto, quando la pubblicazione si ferma
   *  a chiedere. null = non c'è niente in sospeso. */
  const [sottoContratto, setSottoContratto] = React.useState<SottoContratto[] | null>(
    null,
  );

  const pubblica = (forza = false) =>
    startLavoro(async () => {
      const esito = await pubblicaSettimana(monday, forza);
      if (!esito.ok) {
        // Non è un errore: è la settimana che ha qualcosa da farti vedere
        // prima. Si mostra chi e quanto, e si chiede se procedere.
        if (esito.sotto?.length) {
          setSottoContratto(esito.sotto);
          return;
        }
        toast.error(esito.error);
        return;
      }
      setSottoContratto(null);
      toast.success("Settimana pubblicata. Da adesso i tuoi la vedono sul telefono.");
      router.refresh();
    });
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);

  /* -------------------------------------------- modifiche in sospeso ----
   * Una settimana pubblicata si tocca solo premendo Modifica: da li' le
   * modifiche restano locali — i dipendenti continuano a vedere la
   * versione pubblicata — e partono tutte insieme con Conferma. Le frecce
   * annullano e ripetono sull'elenco locale, una mossa alla volta: quasi
   * sempre un'operazione sola, per «Svuota» tutte insieme. */
  const [sospese, setSospese] = React.useState<{
    monday: string;
    attivo: boolean;
    fatte: Mossa[];
    annullate: Mossa[];
  }>({ monday, attivo: false, fatte: [], annullate: [] });
  // Cambio settimana = altro tabellone: le sospese dell'altra non valgono.
  if (sospese.monday !== monday) {
    setSospese({ monday, attivo: false, fatte: [], annullate: [] });
  }
  const contatoreNuovi = React.useRef(0);

  /** Il tabellone che si vede: quello vero, oppure quello con le modifiche
   *  in sospeso applicate sopra. Niente memo: la proiezione costa meno del
   *  ragionarci, e cosi' puo' stare prima del gestore che la usa. */
  const turniVivi = sospese.attivo ? proietta(shifts, sospese.fatte.flat()) : shifts;

  /* ------------------------------------------------ storia (in bozza) ---
   * In bozza si salva subito, ma ogni passo si sa disfare: le voci portano
   * l'operazione contraria, e l'id vivo sta in una scatola condivisa
   * perche' rifare una creazione produce un id nuovo. */
  type VoceStoria = {
    desfai: () => Promise<{ ok: boolean; error?: string }>;
    rifai: () => Promise<{ ok: boolean; error?: string }>;
    /** Che cosa disfa questa voce, per scriverlo sul bottone. Un blocco
     *  confermato non è «l'ultima modifica»: sono tutte insieme, e chi ci
     *  passa sopra col dito deve saperlo prima di premere. */
    etichetta?: string;
  };
  const [storia, setStoria] = React.useState<{
    monday: string;
    passato: VoceStoria[];
    futuro: VoceStoria[];
  }>({ monday, passato: [], futuro: [] });
  if (storia.monday !== monday) {
    setStoria({ monday, passato: [], futuro: [] });
  }

  const inputDa = (id: string | undefined, d: Omit<TurnoBozza, "id">) => ({
    id,
    profile_id: d.profile_id,
    department_id: d.department_id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    title: d.title ?? "",
    location: d.location ?? "",
    notes: d.notes ?? "",
  });

  /** Il gestore del pannello turno: diretto in bozza (con storia), locale
   *  in modalita' Modifica. */
  const gestore: GestoreTurni = sospese.attivo
    ? {
        salva: (id, dati) => {
          const vero = id ?? `nuovo:${contatoreNuovi.current++}`;
          setSospese((s0) => ({
            ...s0,
            fatte: [...s0.fatte, [{ tipo: "salva", dopo: { id: vero, ...dati } }]],
            annullate: [],
          }));
          return { ok: true };
        },
        elimina: (id) => {
          const turno = turniVivi.find((t) => t.id === id);
          if (!turno) return { ok: false, error: "Turno non trovato." };
          setSospese((s0) => ({
            ...s0,
            fatte: [...s0.fatte, [{ tipo: "elimina", prima: turnoBozzaDa(turno) }]],
            annullate: [],
          }));
          return { ok: true };
        },
      }
    : {
        salva: async (id, dati) => {
          const prima = id ? shifts.find((t) => t.id === id) : null;
          const esito = await salvaTurno(inputDa(id ?? undefined, dati));
          if (!esito.ok) return esito;

          const scatola = { id: esito.id };
          const voce: VoceStoria = prima
            ? {
                desfai: () =>
                  salvaTurno(inputDa(scatola.id, turnoBozzaDa(prima))),
                rifai: () => salvaTurno(inputDa(scatola.id, dati)),
              }
            : {
                desfai: () => eliminaTurno(scatola.id),
                rifai: async () => {
                  const r = await salvaTurno(inputDa(undefined, dati));
                  if (r.ok) scatola.id = r.id;
                  return r;
                },
              };
          setStoria((s0) => ({ ...s0, passato: [...s0.passato, voce], futuro: [] }));
          toast.success(prima ? "Turno aggiornato." : "Turno creato.");
          router.refresh();
          return esito;
        },
        elimina: async (id) => {
          const prima = shifts.find((t) => t.id === id);
          if (!prima) return { ok: false, error: "Turno non trovato." };
          const esito = await eliminaTurno(id);
          if (!esito.ok) return esito;

          const dati = turnoBozzaDa(prima);
          const scatola = { id };
          const voce: VoceStoria = {
            desfai: async () => {
              const r = await salvaTurno(inputDa(undefined, dati));
              if (r.ok) scatola.id = r.id;
              return r;
            },
            rifai: () => eliminaTurno(scatola.id),
          };
          setStoria((s0) => ({ ...s0, passato: [...s0.passato, voce], futuro: [] }));
          toast.success("Turno eliminato.");
          router.refresh();
          return esito;
        },
      };

  const annulla = () => {
    if (sospese.attivo) {
      setSospese((s0) => {
        const fatte = [...s0.fatte];
        const ultima = fatte.pop();
        return ultima
          ? { ...s0, fatte, annullate: [...s0.annullate, ultima] }
          : s0;
      });
      return;
    }
    startLavoro(async () => {
      const voce = storia.passato[storia.passato.length - 1];
      if (!voce) return;
      const esito = await voce.desfai();
      if (!esito.ok) {
        toast.error(esito.error ?? "Annullamento non riuscito.");
        return;
      }
      setStoria((s0) => ({
        ...s0,
        passato: s0.passato.slice(0, -1),
        futuro: [...s0.futuro, voce],
      }));
      router.refresh();
    });
  };

  const ripeti = () => {
    if (sospese.attivo) {
      setSospese((s0) => {
        const annullate = [...s0.annullate];
        const ultima = annullate.pop();
        return ultima
          ? { ...s0, annullate, fatte: [...s0.fatte, ultima] }
          : s0;
      });
      return;
    }
    startLavoro(async () => {
      const voce = storia.futuro[storia.futuro.length - 1];
      if (!voce) return;
      const esito = await voce.rifai();
      if (!esito.ok) {
        toast.error(esito.error ?? "Ripetizione non riuscita.");
        return;
      }
      setStoria((s0) => ({
        ...s0,
        futuro: s0.futuro.slice(0, -1),
        passato: [...s0.passato, voce],
      }));
      router.refresh();
    });
  };

  const puoAnnullare = sospese.attivo
    ? sospese.fatte.length > 0
    : storia.passato.length > 0;
  const puoRipetere = sospese.attivo
    ? sospese.annullate.length > 0
    : storia.futuro.length > 0;

  const etichettaAnnulla = sospese.attivo
    ? "Annulla l'ultima modifica"
    : (storia.passato[storia.passato.length - 1]?.etichetta ??
      "Annulla l'ultima modifica");

  /** Le sospese partono tutte insieme: prima le cancellazioni, poi i
   *  salvataggi. Il server ricalcola assenze e conferme su ciascuna.
   *
   *  E il blocco confermato **resta disfabile**. Prima le frecce si
   *  spegnevano qui: premuto Conferma, il lavoro appena mandato smetteva di
   *  poter tornare indietro, e un ripensamento voleva dire rimettere a mano
   *  turno per turno quello che si era appena cambiato — proprio nel momento
   *  in cui si è meno lucidi, subito dopo aver premuto.
   *
   *  Il blocco intero diventa **una** voce di storia: la freccia indietro lo
   *  disfa tutto, non un turno per volta. È lo stesso criterio dello
   *  svuotamento — chi ci ripensa non deve premere trenta volte — e la
   *  differenza con la bozza è solo che qui il giro passa dal server, perché
   *  quelle modifiche i dipendenti le hanno già viste. */
  const confermaSospese = () =>
    startLavoro(async () => {
      const { daEliminare, daSalvare } = compatta(sospese.fatte.flat());

      // Com'era il tabellone prima di questo blocco: è la fotografia a cui
      // riporta la freccia indietro. Va presa adesso, non dopo: fra un
      // istante `shifts` sarà già quello nuovo.
      const primaDelBlocco = new Map(shifts.map((t) => [t.id, turnoBozzaDa(t)]));

      // Un turno rifatto prende un id nuovo ogni volta. La scatola tiene
      // quello vivo, come nella storia in bozza, così la freccia avanti sa
      // ancora su che cosa lavorare.
      const scatole = new Map<string, { id: string }>();

      let errori = 0;
      let richieste = 0;
      let avvisi = 0;
      for (const id of daEliminare) {
        const r = await eliminaTurno(id);
        if (!r.ok) errori++;
      }
      for (const t of daSalvare) {
        const r = await salvaTurno(
          inputDa(t.creazione ? undefined : t.id, t),
        );
        if (!r.ok) errori++;
        else {
          scatole.set(t.id, { id: r.id });
          if (r.richiede) richieste++;
          if (r.avviso) avvisi++;
        }
      }

      const guasto = (n: number) =>
        n === 0
          ? { ok: true as const }
          : {
              ok: false as const,
              error: `${n} ${n === 1 ? "turno non è tornato" : "turni non sono tornati"} al suo posto: controlla il tabellone.`,
            };

      const quante = daEliminare.length + daSalvare.length;
      const voce: VoceStoria = {
        etichetta:
          quante === 1
            ? "Annulla la modifica appena confermata"
            : `Annulla le ${quante} modifiche appena confermate`,
        desfai: async () => {
          let male = 0;
          // Prima se ne vanno i turni che il blocco aveva creato: fossero
          // rimasti, la persona si ritroverebbe il turno nuovo *e* quello
          // vecchio rimesso in piedi qui sotto.
          for (const t of daSalvare) {
            if (!t.creazione) continue;
            const s = scatole.get(t.id);
            if (s) {
              const r = await eliminaTurno(s.id);
              if (!r.ok) male++;
            }
          }
          for (const t of daSalvare) {
            if (t.creazione) continue;
            const base = primaDelBlocco.get(t.id);
            const s = scatole.get(t.id);
            if (!base || !s) continue;
            const r = await salvaTurno(inputDa(s.id, base));
            if (!r.ok) male++;
          }
          for (const id of daEliminare) {
            const base = primaDelBlocco.get(id);
            if (!base) continue;
            const r = await salvaTurno(inputDa(undefined, base));
            if (r.ok) scatole.set(id, { id: r.id });
            else male++;
          }
          return guasto(male);
        },
        rifai: async () => {
          let male = 0;
          for (const id of daEliminare) {
            const s = scatole.get(id);
            const r = await eliminaTurno(s?.id ?? id);
            if (!r.ok) male++;
          }
          for (const t of daSalvare) {
            const s = scatole.get(t.id);
            const r = await salvaTurno(
              inputDa(t.creazione ? undefined : (s?.id ?? t.id), t),
            );
            if (r.ok) scatole.set(t.id, { id: r.id });
            else male++;
          }
          return guasto(male);
        },
      };

      setSospese({ monday, attivo: false, fatte: [], annullate: [] });
      // La storia riparte da qui con una voce sola, quella del blocco: le
      // voci di prima parlavano di un tabellone che non c'è più.
      if (errori === 0) setStoria({ monday, passato: [voce], futuro: [] });
      router.refresh();
      if (errori > 0) {
        toast.error(
          `${errori} ${errori === 1 ? "modifica non applicata" : "modifiche non applicate"}: controlla il tabellone.`,
        );
      } else {
        toast.success(
          [
            "Modifiche pubblicate. Da adesso i tuoi vedono la settimana aggiornata.",
            richieste > 0
              ? `${richieste} ${richieste === 1 ? "turno vale" : "turni valgono"} da subito, ma ${richieste === 1 ? "l'interessato può rifiutarlo" : "gli interessati possono rifiutarli"}: se succede te lo dicono i messaggi.`
              : null,
            avvisi > 0
              ? `${avvisi} ${avvisi === 1 ? "persona trova" : "persone trovano"} nell'app quello che ${avvisi === 1 ? "le" : "gli"} è stato tolto.`
              : null,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    });

  const [confermaSvuota, setConfermaSvuota] = React.useState(false);
  const svuota = () => {
    // In modalita' Modifica lo svuotamento e' una modifica come le altre:
    // resta locale, e' una mossa sola — la freccia indietro la toglie tutta
    // insieme — e il server non vede niente fino alla conferma.
    if (sospese.attivo) {
      if (turniVivi.length > 0) {
        setSospese((s0) => ({
          ...s0,
          fatte: [
            ...s0.fatte,
            turniVivi.map((t) => ({ tipo: "elimina" as const, prima: turnoBozzaDa(t) })),
          ],
          annullate: [],
        }));
      }
      setConfermaSvuota(false);
      return;
    }
    startLavoro(async () => {
      const esito = await eliminaTuttiITurni(monday);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      setConfermaSvuota(false);
      // Il ritratto di quello che e' stato cancellato lo fa il server, nel
      // momento in cui cancella. Le voci di storia vecchie puntano a turni
      // che non esistono piu': la storia riparte da qui, e lo svuotamento
      // e' l'unica cosa che ora si puo' disfare.
      const ritratto = esito.ritratto;
      setStoria({
        monday,
        passato: ritratto
          ? [
              {
                desfai: () => ripristinaTurni({ monday, turni: ritratto }),
                rifai: async () => eliminaTuttiITurni(monday),
              },
            ]
          : [],
        futuro: [],
      });
      toast.success(
        ritratto
          ? "Settimana svuotata: torna a vederla solo tu. Finché resti qui, la freccia indietro la rimette com'era."
          : "Settimana svuotata: torna a vederla solo tu.",
      );
      router.refresh();
    });
  };
  const [copiaAperta, setCopiaAperta] = React.useState(false);
  const [cerca, setCerca] = React.useState("");
  const [filtroReparto, setFiltroReparto] = React.useState("");
  const [filtroContratto, setFiltroContratto] = React.useState("");
  const [filtroOre, setFiltroOre] = React.useState("");
  // Si tiene la posizione nella settimana, non la data. Tenendo la data,
  // cambiando settimana il giorno scelto sarebbe uno che non c'e' piu' e
  // servirebbe un effetto per rimetterlo a posto; cosi' invece il martedi'
  // resta il martedi', e non serve nessun effetto.
  const [indiceGiorno, setIndiceGiorno] = React.useState(() => {
    const oggi = days.findIndex((d) => isToday(fromISODate(d)));
    return oggi >= 0 ? oggi : 0;
  });
  const selectedDay = days[indiceGiorno] ?? days[0];

  /** Che cosa si sta scrivendo nelle caselle: i turni, o le disponibilità di
   *  chi è a chiamata.
   *
   *  Due viste e non due pagine. La disponibilità e il turno sono la stessa
   *  domanda guardata da due parti — «chi posso mettere sabato» — e tenerle
   *  in due schermate diverse obbligherebbe il responsabile a ricordarsi il
   *  tabellone mentre guarda il calendario. Stessa griglia, stessi sette
   *  giorni, stessa settimana: cambia solo cosa c'è scritto dentro. E nella
   *  vista dei turni le disponibilità restano comunque visibili in ogni
   *  casella, perché leggerle non deve costare nemmeno un clic. */
  const [vista, setVista] = React.useState<"turni" | "disponibilita">("turni");

  /** Indice turni[persona][giorno]: la griglia lo consulta 7 volte per riga,
   *  filtrare l'array ogni volta sarebbe quadratico. */
  const byCell = (() => {
    const map = new Map<string, Shift[]>();
    for (const s of turniVivi) {
      const key = `${s.profile_id ?? UNASSIGNED}|${s.date}`;
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  })();

  const cell = (profileId: string, day: string) =>
    byCell.get(`${profileId}|${day}`) ?? [];

  /* ------------------------- le disponibilita' di chi e' a chiamata
   *
   *  Non e' un promemoria: sotto la lista bianca una casella non dichiarata
   *  e' una casella in cui il salvataggio dira' di no. Il responsabile deve
   *  vederlo **prima** di cliccare — scoprirlo dopo, un turno alla volta,
   *  vorrebbe dire costruire la settimana a tentativi. */
  const versoInVigore = versoDelRegime(regimeChiamata);

  const dichiarazioniDi = (() => {
    const map = new Map<string, Dichiarazione[]>();
    for (const d of disponibilita) {
      const lista = map.get(d.profile_id);
      const riga: Dichiarazione = {
        giorno: d.giorno,
        dalle: d.dalle,
        alle: d.alle,
        verso: d.verso,
      };
      if (lista) lista.push(riga);
      else map.set(d.profile_id, [riga]);
    }
    return map;
  })();

  /** null quando non c'e' niente da disegnare: la persona non e' a chiamata,
   *  o il regime il calendario non lo usa. */
  const dispDelGiorno = (riga: Riga, day: string): StatoGiorno | null => {
    if (!versoInVigore || !riga.aChiamata || riga.unassigned) return null;
    return statoDelGiorno({
      regime: regimeChiamata,
      dichiarazioni: dichiarazioniDi.get(riga.id) ?? [],
      giorno: day,
    });
  };

  /** Sotto la lista bianca il silenzio e' un no: quel giorno la persona non
   *  si e' resa disponibile, e li' non si puo' scrivere niente. Sotto la
   *  lista nera invece il silenzio e' un si', ed e' il caso normale. */
  const chiusoPerSilenzio = (riga: Riga, day: string) =>
    versoInVigore === "posso" &&
    riga.aChiamata &&
    !riga.unassigned &&
    !dispDelGiorno(riga, day);

  /** Il turno c'e', ma quel giorno la persona e' assente: resta in elenco e
   *  non si conta. Cancellarlo farebbe sparire dallo schermo proprio il buco
   *  che il responsabile deve coprire. */
  const assente = (s: Shift) =>
    Boolean(assenzaDelGiorno(assenze, s.profile_id, s.date));

  /** Il reparto scritto sotto l'orario. Ha preso il posto della mansione:
   *  guardando il tabellone la domanda è chi copre dove, e la mansione la si
   *  legge aprendo il turno. */
  const repartoDi = (s: Shift) =>
    repartoDelTurno(
      departments,
      s.department_id,
      profiles.find((p) => p.id === s.profile_id)?.department_id ?? null,
    );

  const weeklyMinutes = (() => {
    const totals = new Map<string, number>();
    for (const s of turniVivi) {
      // Solo i giorni di questa settimana. Una modifica in sospeso puo'
      // riguardare un altro periodo — si crea un turno da un messaggio, si
      // sposta una data nel pannello — e sommarla qui gonfierebbe un monte
      // ore per un turno che in questo tabellone non si vede nemmeno.
      if (!days.includes(s.date)) continue;
      // Assente quel giorno, o ha detto di no: in tutti e due i casi quelle
      // ore non le fa nessuno, e il monte ore deve dire quanto si lavorera'
      // davvero, non quanto era stato messo in programma. La domanda sta in
      // un posto solo (`lib/ore-effettive.ts`) perche' la fanno anche la
      // schermata del dipendente, il Prospetto e il controllo prima di
      // pubblicare: due numeri diversi sulla stessa persona e sulla stessa
      // settimana insegnano a non fidarsi di nessuno dei due.
      if (!siLavoreraDavvero(s, assenze)) continue;
      const key = s.profile_id ?? UNASSIGNED;
      totals.set(key, (totals.get(key) ?? 0) + durationMinutes(s.start_time, s.end_time));
    }
    return totals;
  })();

  const hasUnassigned = turniVivi.some((s) => s.profile_id === null);

  const rows: Riga[] = [
    ...profiles.map((p) => ({
      id: p.id,
      name: p.full_name,
      contratto: p.contract_hours === null ? null : Number(p.contract_hours),
      aChiamata: p.on_call,
      assenza: assenze.find((a) => a.profile_id === p.id) ?? null,
      tipoContratto: p.contract_type,
      repartoPersona: p.department_id,
      reparti: p.department_id
        ? [...new Set([p.department_id, ...p.reparti])]
        : p.reparti,
    })),
    ...(hasUnassigned
      ? [
          {
            id: UNASSIGNED,
            name: "Scoperto",
            unassigned: true,
            contratto: null,
            aChiamata: false,
            assenza: null,
            tipoContratto: null,
            repartoPersona: null,
            reparti: [],
          },
        ]
      : []),
  ];

  // Si filtrano le righe, non `profiles`: l'elenco del pannello «nuovo turno»
  // deve restare intero, altrimenti cercando un nome non si potrebbe piu'
  // assegnare il turno a nessun altro. Il filtro per reparto guarda tutti i
  // reparti in cui la persona puo' lavorare, non solo il principale; la riga
  // "Scoperto" resta sempre, perche' nascondere i turni che non sono di
  // nessuno e' il modo piu' silenzioso di dimenticarli.
  /** Tipo di contratto: come scritto sulla scheda della persona. */
  const passaTipo = (r: Riga) =>
    !filtroContratto || r.unassigned || r.tipoContratto === filtroContratto;

  /** Stato delle ore rispetto al contratto, sulla settimana mostrata:
   *  chi ha gia' straordinari, chi e' sotto, chi e' in pari. */
  const passaOre = (r: Riga) => {
    if (!filtroOre || r.unassigned) return true;
    if (r.contratto === null) return false;
    const ore = (weeklyMinutes.get(r.id) ?? 0) / 60;
    if (filtroOre === "sotto") return ore < r.contratto - 0.01;
    if (filtroOre === "oltre") return ore > r.contratto + 0.01;
    return ore >= r.contratto - 0.01 && ore <= r.contratto + 0.01;
  };

  const righe = rows.filter(
    (r) =>
      (!cerca.trim() || corrisponde(r.name, cerca)) &&
      (!filtroReparto || r.unassigned || r.reparti.includes(filtroReparto)) &&
      passaTipo(r) &&
      passaOre(r),
  );

  /** Chi e' a chiamata, per la vista delle disponibilita'.
   *
   *  Passa dalla ricerca e dal reparto — chi cerca un nome nei turni si
   *  aspetta di ritrovarlo cercandolo qui — ma **non** dai filtri sul
   *  contratto e sul monte ore. Quei due, applicati qui, svuoterebbero la
   *  vista: «a chiamata» e' gia' la condizione di questo elenco, e chi e' a
   *  chiamata un monte ore non ce l'ha, quindi «sotto le ore» lo escluderebbe
   *  sempre. E le due tendine in questa vista sono nascoste: chi ci fosse
   *  finito dentro si troverebbe una schermata vuota e niente da spegnere. */
  const aChiamata = rows
    .filter(
      (r) =>
        r.aChiamata &&
        !r.unassigned &&
        (!cerca.trim() || corrisponde(r.name, cerca)) &&
        (!filtroReparto || r.reparti.includes(filtroReparto)),
    )
    .map((r) => ({ id: r.id, name: r.name }));

  /** Su una settimana pubblicata si interviene solo da modalita'
   *  Modifica: senza, il click spiega invece di agire. */
  const modificabile = inBozza || sospese.attivo;

  const apriTurno = (s: Shift) => {
    if (!modificabile) {
      toast.info("Settimana pubblicata: premi \u00abModifica\u00bb per cambiarla.");
      return;
    }
    setDraft(shiftToDraft(s));
  };

  const openNew = (
    day: string,
    profileId: string | null,
    /** Gli orari con cui aprire il pannello, quando si sa gia' quali
     *  devono essere: rifacendo un turno rifiutato sono quelli che erano
     *  stati tolti. */
    orari?: { start_time: string; end_time: string },
  ) => {
    if (!modificabile) {
      toast.info("Settimana pubblicata: premi \u00abModifica\u00bb per cambiarla.");
      return;
    }
    setDraft({
      date: day,
      profile_id: profileId === UNASSIGNED ? null : profileId,
      ...orari,
    });
  };

  return (
    <div className="space-y-4">
      {/* Sopra il tabellone, prima di tutto: sono turni gia' cambiati, o da
          rifare. Restano qui anche cambiando settimana — il buco non e' di
          questa settimana, e' della giornata che l'ha lasciato. */}
      <Messaggi
        messaggi={messaggi}
        risposteSettimana={risposteSettimana}
        nomeDi={(id) =>
          profiles.find((p) => p.id === id)?.full_name ?? "Una persona"
        }
        // Di chi non e' piu' in squadra non si rifa' il turno: il pannello
        // non saprebbe nemmeno chi mettere nella tendina delle persone.
        inSquadra={(id) => profiles.some((p) => p.id === id)}
        // Dalla stessa porta degli altri: su una settimana pubblicata anche
        // questo bottone deve passare da «Modifica», altrimenti lo stesso
        // gesto seguirebbe due regole diverse a seconda di dove lo premi.
        onCreaTurno={(profileId, giorno, orari) =>
          openNew(giorno, profileId, orari)
        }
      />

      {profiles.length === 0 ? (
        <>
          <WeekNav monday={monday} />
          <EmptyTeam />
        </>
      ) : (
        <>
          {/* Tutto su una riga sola sopra il tabellone: settimana, ricerca,
              filtri e la creazione. Da telefono la riga va a capo da sola. */}
          <div className="flex flex-wrap items-center gap-2">
            <WeekNav monday={monday} />
            {/* Compare solo dove serve: un'azienda senza nessuno a chiamata,
                o che le chiamate le fa una per volta, non ha un calendario
                da guardare e questo bottone le direbbe solo che le manca
                qualcosa. */}
            {versoInVigore && aChiamata.length > 0 ? (
              <div
                role="radiogroup"
                aria-label="Cosa stai guardando"
                className="flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
              >
                {(
                  [
                    ["turni", "Turni"],
                    ["disponibilita", "Disponibilità"],
                  ] as const
                ).map(([quale, testo]) => (
                  <button
                    key={quale}
                    type="button"
                    role="radio"
                    aria-checked={vista === quale}
                    onClick={() => setVista(quale)}
                    className={cn(
                      "tap h-8 rounded-full px-3 text-[13px] font-medium",
                      vista === quale
                        ? "bg-surface text-text shadow-soft"
                        : "text-muted hover:text-text",
                    )}
                  >
                    {testo}
                  </button>
                ))}
              </div>
            ) : null}
            <Ricerca
              valore={cerca}
              onChange={setCerca}
              id="cerca-turni"
              className="w-full sm:w-48"
            />
            {/* I filtri e i comandi che cambiano i turni valgono per i
                turni. Nella vista delle disponibilità sarebbero bottoni che
                agiscono su quello che non si sta guardando. */}
            {vista === "turni" ? (
            <>
            {departments.length > 0 ? (
              <Select
                aria-label="Filtra per reparto"
                value={filtroReparto}
                onChange={(e) => setFiltroReparto(e.target.value)}
                className="w-auto min-w-32 sm:h-9"
              >
                <option value="">Tutti i reparti</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              aria-label="Filtra per contratto"
              value={filtroContratto}
              onChange={(e) => setFiltroContratto(e.target.value)}
              className="w-auto min-w-32 sm:h-9"
            >
              <option value="">Qualsiasi contratto</option>
              <option value="chiamata">A chiamata</option>
              <option value="part_time">Part time</option>
              <option value="full_time">Full time</option>
            </Select>
            <Select
              aria-label="Filtra per ore"
              value={filtroOre}
              onChange={(e) => setFiltroOre(e.target.value)}
              className="w-auto min-w-32 sm:h-9"
            >
              <option value="">Tutte le ore a settimana</option>
              <option value="oltre">Con straordinari</option>
              <option value="sotto">Sotto le ore</option>
              <option value="pari">In pari</option>
            </Select>

            {/* --------------------- variazioni, in fondo alla riga
                Dentro il loro recinto: nella stessa riga dei filtri sono i
                soli comandi che il tabellone lo cambiano per davvero, e
                fra «filtra» e «cancella tutto» ci vuole un confine. */}
            <GruppoModifica>
              <Button
                variant="secondary"
                size="icon"
                onClick={annulla}
                disabled={!puoAnnullare || inLavoro}
                aria-label={etichettaAnnulla}
                title={etichettaAnnulla}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={ripeti}
                disabled={!puoRipetere || inLavoro}
                aria-label="Ripeti la modifica annullata"
                title="Ripeti la modifica annullata"
              >
                <Redo2 className="size-4" />
              </Button>

              {inBozza ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => pubblica()}
                  loading={inLavoro}
                  title="Rendi la settimana visibile ai dipendenti"
                >
                  Pubblica
                </Button>
              ) : sospese.attivo ? (
                <>
                  <Button
                    size="sm"
                    onClick={confermaSospese}
                    loading={inLavoro}
                    disabled={sospese.fatte.length === 0}
                  >
                    Pubblica modifiche
                    {sospese.fatte.length > 0 ? (
                      <span className="rounded-full bg-accent-fg/20 px-1.5 text-[12px] cifre">
                        {/* I turni toccati, non i gesti: uno svuotamento e'
                            una mossa sola ma venti modifiche. */}
                        {sospese.fatte.flat().length}
                      </span>
                    ) : null}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSospese({ monday, attivo: false, fatte: [], annullate: [] })
                    }
                    title="Scarta le modifiche non pubblicate"
                  >
                    <X className="size-3.5" />
                    Annulla
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setSospese({ monday, attivo: true, fatte: [], annullate: [] })
                  }
                  title="Modifica la settimana pubblicata: le modifiche valgono solo quando le pubblichi"
                >
                  <PencilLine className="size-3.5" />
                  Modifica
                </Button>
              )}

              {confermaSvuota ? (
                <span className="flex items-center gap-1.5 rounded-lg bg-danger-soft px-2 py-1">
                  <span className="text-[12.5px] font-medium text-danger">
                    Tutta la settimana?
                  </span>
                  <Button variant="danger" size="sm" onClick={svuota} loading={inLavoro}>
                    Sì, elimina
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfermaSvuota(false)}
                  >
                    No
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => setConfermaSvuota(true)}
                  aria-label="Elimina tutti i turni della settimana"
                  title="Elimina tutti i turni della settimana"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </GruppoModifica>

            {/* I tre modi di creare turni, raccolti in un'isoletta: tre
                bottoni sciolti si contendevano la riga coi filtri. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button size="sm">
                  <Plus className="size-4" />
                  Nuovi turni
                  <ChevronDown className="size-3.5 opacity-70" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-40 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-float data-[state=open]:animate-pop"
                >
                  <DropdownMenu.Item
                    onSelect={() => openNew(selectedDay, null)}
                    className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-3"
                  >
                    <PencilLine className="size-3.5 text-muted" />
                    Manuale
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => setCopiaAperta(true)}
                    className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-3"
                  >
                    <Copy className="size-3.5 text-muted" />
                    Copia turni
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/turni/importa"
                      className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-3"
                    >
                      <FileUp className="size-3.5 text-muted" />
                      Importa da un foglio
                    </Link>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            </>
            ) : null}
          </div>

          {vista === "turni" && inBozza ? (
            <p className="rounded-xl bg-warning-soft px-4 py-2.5 text-[13px] font-medium text-warning">
              Questa settimana la vedi solo tu, come ogni settimana nuova: i
              tuoi la vedranno quando premi «Pubblica».
            </p>
          ) : vista === "turni" && sospese.attivo ? (
            <p className="rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] font-medium text-accent">
              Stai modificando una settimana pubblicata: i dipendenti vedono
              ancora la versione di prima, finché non premi «Pubblica
              modifiche».
            </p>
          ) : null}

          {vista === "turni" && righe.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
              {cerca.trim()
                ? "Nessuno con questo nome."
                : filtroContratto || filtroOre
                  ? "Nessuno con questi filtri."
                  : "Nessuno in questo reparto."}
            </p>
          ) : null}

          {vista === "disponibilita" ? (
            <DisponibilitaGriglia
              days={days}
              regime={regimeChiamata}
              persone={aChiamata}
              dichiarazioni={disponibilita}
              indiceGiorno={indiceGiorno}
              onSceglieGiorno={setIndiceGiorno}
              conTurno={(id, day) => cell(id, day).length > 0}
            />
          ) : null}

          {/* ---------------- schermo grande: tabellone ---------------- */}
          <div className={cn(
            "hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
            vista === "turni" && "lg:block",
          )}>
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[64rem]"
                style={{ gridTemplateColumns: "14rem repeat(7, minmax(0, 1fr))" }}
              >
                <div className="sticky left-0 z-20 border-b border-border bg-surface-2 px-4 py-2.5 text-[12px] font-medium text-faint">
                  Persona
                </div>
                {days.map((day) => {
                  const d = fromISODate(day);
                  const today = isToday(d);
                  return (
                    <div
                      key={day}
                      className={cn(
                        "border-b border-l border-border bg-surface-2 px-3 py-2.5 text-center",
                        today && "bg-accent-soft",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[12px] font-medium capitalize",
                          today ? "text-accent" : "text-faint",
                        )}
                      >
                        {dayShort(d)}
                      </p>
                      <p
                        className={cn(
                          "text-[15px] font-semibold cifre",
                          today && "text-accent",
                        )}
                      >
                        {d.getDate()}
                      </p>
                    </div>
                  );
                })}

                {righe.map((row) => (
                  <React.Fragment key={row.id}>
                    <div className="sticky left-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[14px] font-medium",
                            row.unassigned && "text-warning",
                          )}
                        >
                          {row.name}
                        </p>
                        {row.assenza ? (
                          <p className="truncate text-[12px] font-medium uppercase tracking-wide text-warning">
                            {ETICHETTA(row.assenza.type)}
                            {row.assenza.end_date === null ? " · in corso" : ""}
                          </p>
                        ) : null}
                        <OreDellaRiga
                          minuti={weeklyMinutes.get(row.id) ?? 0}
                          riga={row}
                        />
                      </div>
                    </div>

                    {days.map((day) => {
                      const list = cell(row.id, day);
                      const disp = dispDelGiorno(row, day);
                      const chiuso = chiusoPerSilenzio(row, day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => openNew(day, row.id)}
                          aria-label={`Aggiungi turno per ${row.name}, ${dayLong(fromISODate(day))}${disp ? ` — ${descriviStato(disp)}` : chiuso ? " — nessuna disponibilità" : ""}`}
                          title={
                            disp
                              ? descriviStato(disp)
                              : chiuso
                                ? "Non ha dato disponibilità per questo giorno: qui non gli si possono dare turni."
                                : undefined
                          }
                          className={cn(
                            "group/cell relative flex min-h-[4.75rem] flex-col gap-1 border-b border-l border-border p-1.5 text-left transition-colors",
                            "hover:bg-surface-2",
                            isToday(fromISODate(day)) && "bg-accent-soft/30",
                            // Il giorno in cui non si puo' scrivere si vede
                            // che non e' una casella come le altre.
                            chiuso && "bg-surface-2/70",
                          )}
                        >
                          <SegnoDisponibilita stato={disp} chiuso={chiuso} />
                          {list.map((s) => (
                            <Chip
                              key={s.id}
                              shift={s}
                              reparto={repartoDi(s)?.name ?? null}
                              assente={assente(s)}
                              onOpen={() => apriTurno(s)}
                            />
                          ))}
                          {list.length === 0 && !chiuso ? (
                            <span className="m-auto text-faint opacity-0 transition-opacity group-hover/cell:opacity-100">
                              <Plus className="size-4" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* ---------------- telefono: un giorno alla volta ---------------- */}
          <div className={cn("lg:hidden", vista !== "turni" && "hidden")}>
            <StrisciaGiorni
              days={days}
              indice={indiceGiorno}
              onSceglie={setIndiceGiorno}
              segnati={(day) => shifts.some((s) => s.date === day)}
            />

            {righe.length > 0 ? (
              <DayList
                day={selectedDay}
                rows={righe}
                cell={cell}
                assente={assente}
                disponibilita={(r) => ({
                  stato: dispDelGiorno(r, selectedDay),
                  chiuso: chiusoPerSilenzio(r, selectedDay),
                })}
                reparto={(s) => repartoDi(s)?.name ?? null}
                soloConTurni={!cerca.trim()}
                onOpen={(s) => apriTurno(s)}
                onAdd={(profileId) => openNew(selectedDay, profileId)}
              />
            ) : null}
          </div>
        </>
      )}

      <ShiftDialog
        draft={draft}
        profiles={profiles}
        departments={departments}
        repartoFrequente={repartoFrequente}
        gestore={gestore}
        onClose={() => setDraft(null)}
      />

      {copiaAperta ? (
        <CopiaDialog
          monday={monday}
          giorno={selectedDay}
          onCopiato={() => setStoria({ monday, passato: [], futuro: [] })}
          onClose={() => setCopiaAperta(false)}
        />
      ) : null}

      {sottoContratto ? (
        <Modal
          open
          onOpenChange={(v) => !v && setSottoContratto(null)}
          title="A qualcuno mancano delle ore"
          description="Puoi pubblicare lo stesso, ma prima guarda chi."
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSottoContratto(null)}
                disabled={inLavoro}
              >
                Torno indietro
              </Button>
              <Button
                type="button"
                onClick={() => pubblica(true)}
                loading={inLavoro}
                disabled={inLavoro}
              >
                Pubblica lo stesso
              </Button>
            </>
          }
        >
          <ul className="divide-y divide-border">
            {sottoContratto.map((p) => (
              <li key={p.id} className="flex items-baseline gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[14px]">{p.nome}</span>
                <span className="shrink-0 text-[13px] font-medium cifre text-warning">
                  −{formatDuration(p.mancano)}
                </span>
                <span className="shrink-0 text-[12.5px] cifre text-muted">
                  su {formatDuration(p.dovuti)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted">
            Se in quei giorni non c&apos;erano, segna l&apos;assenza dai Permessi:
            le ore di chi è assente non si contano.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function Chip({
  shift,
  reparto,
  assente,
  onOpen,
}: {
  shift: Shift;
  /** Il reparto del turno, già risolto. null se non ne ha nessuno. */
  reparto: string | null;
  assente?: boolean;
  onOpen: () => void;
}) {
  const unassigned = shift.profile_id === null;
  const stato = statoConferma(shift);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      }}
      className={cn(
        "tap block cursor-pointer rounded-md px-2 py-1 text-left",
        unassigned
          ? "bg-warning-soft text-warning"
          : "bg-accent-soft text-accent",
        assente && "assente border border-current",
        // Un anello, non un colore nuovo: il turno vale comunque, ha solo
        // qualcosa di particolare. Arancio finche' la persona non si e'
        // espressa, verde quando ha detto di si', rosso quando ha detto di
        // no — e il rosso e' piu' spesso perche' e' l'unico che chiede al
        // responsabile di fare qualcosa.
        stato === "in_attesa" && "ring-1 ring-warning",
        stato === "accettato" && "ring-1 ring-success",
        stato === "rifiutato" && "ring-2 ring-danger",
      )}
      title={stato ? SPIEGA_CONFERMA[stato] : undefined}
    >
      <span className="orario flex items-center gap-1 text-[12px] font-semibold cifre">
        {timeRange(shift.start_time, shift.end_time)}
        {/* Il colore da solo non basta: arancio e verde sono la coppia che
            un daltonismo su rosso e verde appiattisce, e su questa griglia
            non c'e' spazio per scriverci sopra una parola. Un segno lo
            distingue anche a colori spenti — e il titolo, dove c'e' un
            mouse, lo dice per esteso. */}
        {stato === "accettato" ? (
          <Check className="size-3 shrink-0 text-success" aria-hidden />
        ) : stato === "rifiutato" ? (
          <X className="size-3 shrink-0 text-danger" aria-hidden />
        ) : stato === "in_attesa" ? (
          <Clock3 className="size-3 shrink-0 text-warning" aria-hidden />
        ) : null}
        {stato ? (
          <span className="sr-only">{ETICHETTA_CONFERMA[stato]}</span>
        ) : null}
      </span>
      {/* Senza opacity: e' dove ci si deve presentare. Sta gia' sotto
          all'orario e senza grassetto, e tanto basta a dire che non e' la
          riga principale; sbiadito scendeva a 3,31. */}
      {reparto ? (
        <span className="block truncate text-[12px]">{reparto}</span>
      ) : null}
    </span>
  );
}

function DayList({
  day,
  rows,
  cell,
  assente,
  disponibilita,
  reparto,
  soloConTurni = true,
  onOpen,
  onAdd,
}: {
  day: string;
  rows: Riga[];
  cell: (profileId: string, day: string) => Shift[];
  assente: (s: Shift) => boolean;
  /** Cosa ha detto di questo giorno, per chi è a chiamata. Da telefono
   *  questa è l'unica vista del tabellone: senza, il responsabile che
   *  costruisce la settimana in negozio non vedrebbe mai le disponibilità. */
  disponibilita: (riga: Riga) => { stato: StatoGiorno | null; chiuso: boolean };
  /** Il reparto del turno, già risolto: sta al posto della mansione. */
  reparto: (s: Shift) => string | null;
  /** Normalmente si mostra solo chi ha turni quel giorno. Quando si sta
   *  cercando un nome no: chi cerca una persona vuole vederla anche se quel
   *  giorno e' libera — e' proprio quello il giorno in cui le si aggiunge
   *  un turno. */
  soloConTurni?: boolean;
  onOpen: (s: Shift) => void;
  onAdd: (profileId: string | null) => void;
}) {
  const withShifts = rows
    .map((row) => ({ row, list: cell(row.id, day) }))
    // Chi è a chiamata e ha detto qualcosa su questo giorno si vede anche
    // senza turni: è un'informazione su cui si decide chi chiamare, e
    // nasconderla finché non c'è già un turno la renderebbe inutile.
    .filter(
      (r) =>
        !soloConTurni ||
        r.list.length > 0 ||
        Boolean(disponibilita(r.row).stato),
    );

  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] capitalize text-muted">{dayLong(fromISODate(day))}</p>

      {withShifts.length === 0 ? (
        <button
          type="button"
          onClick={() => onAdd(null)}
          className="tap flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-8 text-muted"
        >
          <CalendarPlus className="size-5" />
          <span className="text-[13.5px]">Nessun turno in questo giorno</span>
          <span className="text-[12.5px] text-faint">
            Qui compaiono i turni del giorno, con orario, reparto e chi li fa.
          </span>
          <span className="text-[12.5px] font-medium text-accent">
            Tocca per aggiungerne uno
          </span>
        </button>
      ) : (
        <ul className="stagger space-y-2">
          {withShifts.map(({ row, list }) => (
            <li
              key={row.id}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3.5 py-2">
                <p
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 truncate text-[13.5px] font-medium",
                    row.unassigned && "text-warning",
                  )}
                >
                  <span className="truncate">{row.name}</span>
                  <SegnoDisponibilita
                    stato={disponibilita(row).stato}
                    chiuso={disponibilita(row).chiuso}
                  />
                </p>
                <button
                  type="button"
                  onClick={() => onAdd(row.unassigned ? null : row.id)}
                  aria-label={`Aggiungi turno per ${row.name}`}
                  className="tap grid size-7 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-text"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <ul className="divide-y divide-border">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(s)}
                      className={cn(
                        "tap flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2",
                        assente(s) && "assente",
                      )}
                    >
                      <span className="orario text-[15px] font-semibold cifre">
                        {hhmm(s.start_time)}
                      </span>
                      <span className="text-faint">→</span>
                      <span className="orario text-[15px] font-semibold cifre">
                        {hhmm(s.end_time)}
                      </span>
                      {/* Da telefono questa e' l'unica vista del tabellone:
                          senza la pastiglia, com'e' messo un turno che
                          aspetta una risposta non si vedrebbe proprio — e il
                          telefono e' dove l'app si usa di piu'. */}
                      <Pastiglia
                        stato={statoConferma(s)}
                        altrimenti={
                          assente(s)
                            ? "non conta"
                            : (reparto(s) ??
                              formatDuration(
                                durationMinutes(s.start_time, s.end_time),
                              ))
                        }
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Quello che una persona a chiamata ha detto di questo giorno, in una
 *  pastiglia piccola.
 *
 *  Serve al responsabile prima del clic, non dopo: sotto la lista bianca una
 *  casella senza dichiarazione e' una casella in cui il salvataggio dira' di
 *  no, e costruire una settimana a tentativi — scrivi, salva, leggi il
 *  rifiuto, riprova — e' esattamente il lavoro che questa app dovrebbe
 *  togliere. */
function SegnoDisponibilita({
  stato,
  chiuso,
}: {
  stato: StatoGiorno | null;
  /** Lista bianca, e per questo giorno non ha dichiarato niente. */
  chiuso: boolean;
}) {
  // Era 10px maiuscolo e spaziato: la misura piu' piccola di tutta l'app, due
  // gradini sotto il pavimento dei 12px. Alzandola qui il maiuscolo se ne va
  // insieme alla spaziatura, altrimenti la pastiglia cresce di un quinto e
  // `truncate` si mangia le parole dentro una riga gia' stretta. In minuscolo
  // tornano anche le ascendenti, che sono meta' di come si legge una parola.
  if (!stato) {
    if (!chiuso) return null;
    return (
      <span className="truncate rounded px-1 py-0.5 text-[12px] font-medium text-faint">
        nessuna disp.
      </span>
    );
  }

  return (
    <span
      className={cn(
        "truncate rounded px-1 py-0.5 text-[12px] font-medium",
        stato.verso === "non_posso"
          ? "bg-danger-soft text-danger"
          : "bg-success-soft text-success",
      )}
    >
      {stato.intero
        ? stato.verso === "non_posso"
          ? "non c'è"
          : "disponibile"
        : stato.fasce.map((f) => `${f.dalle}–${f.alle}`).join(" ")}
    </span>
  );
}

/** In coda alla riga del giorno: come sta messo il turno, o — quando non
 *  c'e' niente di particolare da dire — quello che ci starebbe comunque
 *  (il reparto, o quanto dura). */
function Pastiglia({
  stato,
  altrimenti,
}: {
  stato: StatoConferma | null;
  altrimenti: string;
}) {
  if (!stato) {
    return (
      <span className="ml-auto truncate text-[13px] text-muted">{altrimenti}</span>
    );
  }
  return (
    <span
      title={SPIEGA_CONFERMA[stato]}
      className={cn(
        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium",
        stato === "rifiutato"
          ? "bg-danger-soft text-danger"
          : stato === "accettato"
            ? "bg-success-soft text-success"
            : "bg-warning-soft text-warning",
      )}
    >
      {ETICHETTA_CONFERMA[stato]}
    </span>
  );
}

function EmptyTeam() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-surface-3 text-muted">
        <Users className="size-5" />
      </div>
      <div>
        <p className="text-[15px] font-medium">Non c&apos;è ancora nessuno in squadra</p>
        <p className="mt-1 text-[13.5px] text-muted">
          Aggiungi le persone e potrai iniziare a metterle in turno.
        </p>
      </div>
      <Link href="/squadra">
        <Button size="sm">
          <Plus className="size-4" />
          Aggiungi dipendenti
        </Button>
      </Link>
    </div>
  );
}

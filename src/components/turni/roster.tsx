"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarPlus,
  ChevronDown,
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
  salvaTurno,
} from "@/app/(app)/turni/actions";
import { CopiaDialog } from "@/components/turni/copia-dialog";
import {
  ShiftDialog,
  shiftToDraft,
  type GestoreTurni,
  type ShiftDraft,
} from "@/components/turni/shift-dialog";
import { WeekNav } from "@/components/turni/week-nav";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Ricerca } from "@/components/ui/ricerca";
import { repartoDelTurno } from "@/lib/reparto";
import {
  compatta,
  proietta,
  turnoBozzaDa,
  type Operazione,
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
import type { Absence, Department, Profile, Shift } from "@/lib/types";
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
        "text-[12px] tabular-nums",
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
}) {
  const router = useRouter();
  const [inLavoro, startLavoro] = React.useTransition();

  const pubblica = () =>
    startLavoro(async () => {
      const esito = await pubblicaSettimana(monday);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Settimana pubblicata: ora i dipendenti la vedono.");
      router.refresh();
    });
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);

  /* -------------------------------------------- modifiche in sospeso ----
   * Una settimana pubblicata si tocca solo premendo Modifica: da li' le
   * modifiche restano locali — i dipendenti continuano a vedere la
   * versione pubblicata — e partono tutte insieme con Conferma. Le frecce
   * annullano e ripetono sull'elenco locale. */
  const [sospese, setSospese] = React.useState<{
    monday: string;
    attivo: boolean;
    fatte: Operazione[];
    annullate: Operazione[];
  }>({ monday, attivo: false, fatte: [], annullate: [] });
  // Cambio settimana = altro tabellone: le sospese dell'altra non valgono.
  if (sospese.monday !== monday) {
    setSospese({ monday, attivo: false, fatte: [], annullate: [] });
  }
  const contatoreNuovi = React.useRef(0);

  /** Il tabellone che si vede: quello vero, oppure quello con le modifiche
   *  in sospeso applicate sopra. Niente memo: la proiezione costa meno del
   *  ragionarci, e cosi' puo' stare prima del gestore che la usa. */
  const turniVivi = sospese.attivo ? proietta(shifts, sospese.fatte) : shifts;

  /* ------------------------------------------------ storia (in bozza) ---
   * In bozza si salva subito, ma ogni passo si sa disfare: le voci portano
   * l'operazione contraria, e l'id vivo sta in una scatola condivisa
   * perche' rifare una creazione produce un id nuovo. */
  type VoceStoria = {
    desfai: () => Promise<{ ok: boolean; error?: string }>;
    rifai: () => Promise<{ ok: boolean; error?: string }>;
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
            fatte: [...s0.fatte, { tipo: "salva", dopo: { id: vero, ...dati } }],
            annullate: [],
          }));
          return { ok: true };
        },
        elimina: (id) => {
          const turno = turniVivi.find((t) => t.id === id);
          if (!turno) return { ok: false, error: "Turno non trovato." };
          setSospese((s0) => ({
            ...s0,
            fatte: [...s0.fatte, { tipo: "elimina", prima: turnoBozzaDa(turno) }],
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

  /** Le sospese partono tutte insieme: prima le cancellazioni, poi i
   *  salvataggi. Il server ricalcola assenze e conferme su ciascuna. */
  const confermaSospese = () =>
    startLavoro(async () => {
      const { daEliminare, daSalvare } = compatta(sospese.fatte);
      let errori = 0;
      let richieste = 0;
      for (const id of daEliminare) {
        const r = await eliminaTurno(id);
        if (!r.ok) errori++;
      }
      for (const t of daSalvare) {
        const r = await salvaTurno(
          inputDa(t.creazione ? undefined : t.id, t),
        );
        if (!r.ok) errori++;
        else if (r.richiede) richieste++;
      }
      setSospese({ monday, attivo: false, fatte: [], annullate: [] });
      router.refresh();
      if (errori > 0) {
        toast.error(
          `${errori} ${errori === 1 ? "modifica non applicata" : "modifiche non applicate"}: controlla il tabellone.`,
        );
      } else {
        toast.success(
          richieste > 0
            ? `Modifiche applicate. ${richieste} ${richieste === 1 ? "turno aspetta" : "turni aspettano"} la conferma dell'interessato, con la motivazione scritta.`
            : "Modifiche applicate.",
        );
      }
    });

  const [confermaSvuota, setConfermaSvuota] = React.useState(false);
  const svuota = () =>
    startLavoro(async () => {
      const esito = await eliminaTuttiITurni(monday);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      setConfermaSvuota(false);
      setSospese({ monday, attivo: false, fatte: [], annullate: [] });
      setStoria({ monday, passato: [], futuro: [] });
      toast.success("Settimana svuotata: torna in bozza.");
      router.refresh();
    });
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
      // Le ore di chi e' assente non si sommano: il monte ore deve dire
      // quanto lavorera' davvero, non quanto era stato messo in programma.
      if (assenzaDelGiorno(assenze, s.profile_id, s.date)) continue;
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
            name: "Da assegnare",
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
  // "Da assegnare" resta sempre, perche' nascondere turni scoperti e' il modo
  // piu' silenzioso di dimenticarli.
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

  const openNew = (day: string, profileId: string | null) => {
    if (!modificabile) {
      toast.info("Settimana pubblicata: premi \u00abModifica\u00bb per cambiarla.");
      return;
    }
    setDraft({ date: day, profile_id: profileId === UNASSIGNED ? null : profileId });
  };

  return (
    <div className="space-y-4">
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
            <Ricerca
              valore={cerca}
              onChange={setCerca}
              id="cerca-turni"
              className="w-full sm:w-48"
            />
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
              <option value="">Qualsiasi monte ore</option>
              <option value="oltre">Con straordinari</option>
              <option value="sotto">Sotto le ore</option>
              <option value="pari">In pari</option>
            </Select>

            {/* --------------------- variazioni, in fondo alla riga */}
            <Button
              variant="secondary"
              size="icon"
              onClick={annulla}
              disabled={!puoAnnullare || inLavoro}
              aria-label="Annulla l'ultima modifica"
              title="Annulla l'ultima modifica"
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
                onClick={pubblica}
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
                  Conferma modifiche
                  {sospese.fatte.length > 0 ? (
                    <span className="rounded-full bg-accent-fg/20 px-1.5 text-[11px] tabular-nums">
                      {sospese.fatte.length}
                    </span>
                  ) : null}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSospese({ monday, attivo: false, fatte: [], annullate: [] })
                  }
                  title="Scarta le modifiche non confermate"
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
                title="Modifica la settimana pubblicata: le modifiche valgono solo alla conferma"
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
                  Elimina
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
          </div>

          {inBozza ? (
            <p className="rounded-xl bg-warning-soft px-4 py-2.5 text-[13px] font-medium text-warning">
              Settimana in bozza, come ogni settimana nuova: i dipendenti la
              vedranno solo quando premi «Pubblica».
            </p>
          ) : sospese.attivo ? (
            <p className="rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] font-medium text-accent">
              Stai modificando una settimana pubblicata: i dipendenti vedono
              ancora la versione di prima, finché non premi «Conferma
              modifiche».
            </p>
          ) : null}

          {righe.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-[13.5px] text-muted">
              {cerca.trim()
                ? "Nessuno con questo nome."
                : filtroContratto || filtroOre
                  ? "Nessuno con questi filtri."
                  : "Nessuno in questo reparto."}
            </p>
          ) : null}

          {/* ---------------- schermo grande: tabellone ---------------- */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:block">
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
                          "text-[15px] font-semibold tabular-nums",
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
                          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-warning">
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
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => openNew(day, row.id)}
                          aria-label={`Aggiungi turno per ${row.name}, ${dayLong(fromISODate(day))}`}
                          className={cn(
                            "group/cell relative flex min-h-[4.75rem] flex-col gap-1 border-b border-l border-border p-1.5 text-left transition-colors",
                            "hover:bg-surface-2",
                            isToday(fromISODate(day)) && "bg-accent-soft/30",
                          )}
                        >
                          {list.map((s) => (
                            <Chip
                              key={s.id}
                              shift={s}
                              reparto={repartoDi(s)?.name ?? null}
                              assente={assente(s)}
                              onOpen={() => apriTurno(s)}
                            />
                          ))}
                          {list.length === 0 ? (
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
          <div className="lg:hidden">
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              {days.map((day, i) => {
                const d = fromISODate(day);
                const active = i === indiceGiorno;
                const count = shifts.filter((s) => s.date === day).length;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setIndiceGiorno(i)}
                    aria-pressed={active}
                    className={cn(
                      "tap flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-xl border px-2 py-2",
                      active
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface text-muted",
                    )}
                  >
                    <span className="text-[11px] font-medium capitalize">
                      {dayShort(d)}
                    </span>
                    <span className="text-[16px] font-semibold tabular-nums">
                      {d.getDate()}
                    </span>
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        count > 0
                          ? active
                            ? "bg-accent-fg"
                            : "bg-accent"
                          : "bg-transparent",
                      )}
                    />
                  </button>
                );
              })}
            </div>

            {righe.length > 0 ? (
              <DayList
                day={selectedDay}
                rows={righe}
                cell={cell}
                assente={assente}
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
          onClose={() => setCopiaAperta(false)}
        />
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
        // Aspetta il si' dell'interessato: un anello, non un colore nuovo.
        shift.richiede_conferma && !shift.confermato_at && "ring-1 ring-warning",
      )}
      title={
        shift.richiede_conferma && !shift.confermato_at
          ? "In attesa della conferma della persona"
          : undefined
      }
    >
      <span className="orario block text-[12px] font-semibold tabular-nums">
        {timeRange(shift.start_time, shift.end_time)}
      </span>
      {reparto ? (
        <span className="block truncate text-[11.5px] opacity-80">{reparto}</span>
      ) : null}
    </span>
  );
}

function DayList({
  day,
  rows,
  cell,
  assente,
  reparto,
  soloConTurni = true,
  onOpen,
  onAdd,
}: {
  day: string;
  rows: Riga[];
  cell: (profileId: string, day: string) => Shift[];
  assente: (s: Shift) => boolean;
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
    .filter((r) => !soloConTurni || r.list.length > 0);

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
          <span className="text-[12.5px] text-faint">Tocca per aggiungerne uno</span>
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
                    "truncate text-[13.5px] font-medium",
                    row.unassigned && "text-warning",
                  )}
                >
                  {row.name}
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
                      <span className="orario text-[15px] font-semibold tabular-nums">
                        {hhmm(s.start_time)}
                      </span>
                      <span className="text-faint">→</span>
                      <span className="orario text-[15px] font-semibold tabular-nums">
                        {hhmm(s.end_time)}
                      </span>
                      <span className="ml-auto truncate text-[13px] text-muted">
                        {assente(s)
                          ? "non conta"
                          : (reparto(s) ??
                            formatDuration(durationMinutes(s.start_time, s.end_time)))}
                      </span>
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

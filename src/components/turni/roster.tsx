"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarPlus,
  ChevronDown,
  Copy,
  FileUp,
  PencilLine,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pubblicaSettimana } from "@/app/(app)/turni/actions";
import { CopiaDialog } from "@/components/turni/copia-dialog";
import { ShiftDialog, shiftToDraft, type ShiftDraft } from "@/components/turni/shift-dialog";
import { WeekNav } from "@/components/turni/week-nav";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Ricerca } from "@/components/ui/ricerca";
import { repartoDelTurno } from "@/lib/reparto";
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
  const [bozzaInCorso, startBozza] = React.useTransition();

  const pubblica = () =>
    startBozza(async () => {
      const esito = await pubblicaSettimana(monday);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Settimana pubblicata: ora i dipendenti la vedono.");
      router.refresh();
    });
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);
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
  const byCell = React.useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.profile_id ?? UNASSIGNED}|${s.date}`;
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

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

  const weeklyMinutes = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of shifts) {
      // Le ore di chi e' assente non si sommano: il monte ore deve dire
      // quanto lavorera' davvero, non quanto era stato messo in programma.
      if (assenzaDelGiorno(assenze, s.profile_id, s.date)) continue;
      const key = s.profile_id ?? UNASSIGNED;
      totals.set(key, (totals.get(key) ?? 0) + durationMinutes(s.start_time, s.end_time));
    }
    return totals;
  }, [shifts, assenze]);

  const hasUnassigned = shifts.some((s) => s.profile_id === null);

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

  const openNew = (day: string, profileId: string | null) =>
    setDraft({ date: day, profile_id: profileId === UNASSIGNED ? null : profileId });

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

            {inBozza ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={pubblica}
                loading={bozzaInCorso}
                title="Rendi la settimana visibile ai dipendenti"
              >
                Pubblica
              </Button>
            ) : null}

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
                              onOpen={() => setDraft(shiftToDraft(s))}
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
                onOpen={(s) => setDraft(shiftToDraft(s))}
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

"use client";

import { CalendarPlus, Copy, FileUp, Plus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { CopiaDialog } from "@/components/turni/copia-dialog";
import { ShiftDialog, shiftToDraft, type ShiftDraft } from "@/components/turni/shift-dialog";
import { WeekNav } from "@/components/turni/week-nav";
import { Button } from "@/components/ui/button";
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
        oltre ? "text-warning" : "text-faint",
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
}: {
  monday: string;
  days: string[];
  profiles: Profile[];
  shifts: Shift[];
  departments: Department[];
  assenze: Absence[];
  /** Per ciascuna persona, il reparto in cui lavora piu' spesso. */
  repartoFrequente: Record<string, string>;
}) {
  const [draft, setDraft] = React.useState<ShiftDraft | null>(null);
  const [copiaAperta, setCopiaAperta] = React.useState(false);
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
          },
        ]
      : []),
  ];

  const openNew = (day: string, profileId: string | null) =>
    setDraft({ date: day, profile_id: profileId === UNASSIGNED ? null : profileId });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNav monday={monday} />

        <div className="flex items-center gap-2">
          <Link href="/turni/importa">
            <Button variant="secondary" size="sm" title="Importa da un foglio Excel o CSV">
              <FileUp className="size-3.5" />
              <span className="hidden sm:inline">Importa</span>
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCopiaAperta(true)}
            title="Copia i turni di una settimana o di un giorno su un altro"
          >
            <Copy className="size-3.5" />
            <span className="hidden sm:inline">Copia turni</span>
          </Button>
          <Button size="sm" onClick={() => openNew(selectedDay, null)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nuovo turno</span>
            <span className="sm:hidden">Turno</span>
          </Button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyTeam />
      ) : (
        <>
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

                {rows.map((row) => (
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

            <DayList
              day={selectedDay}
              rows={rows}
              cell={cell}
              assente={assente}
              onOpen={(s) => setDraft(shiftToDraft(s))}
              onAdd={(profileId) => openNew(selectedDay, profileId)}
            />
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
  assente,
  onOpen,
}: {
  shift: Shift;
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
      )}
    >
      <span className="orario block text-[12px] font-semibold tabular-nums">
        {timeRange(shift.start_time, shift.end_time)}
      </span>
      {shift.title ? (
        <span className="block truncate text-[11.5px] opacity-80">{shift.title}</span>
      ) : null}
    </span>
  );
}

function DayList({
  day,
  rows,
  cell,
  assente,
  onOpen,
  onAdd,
}: {
  day: string;
  rows: Riga[];
  cell: (profileId: string, day: string) => Shift[];
  assente: (s: Shift) => boolean;
  onOpen: (s: Shift) => void;
  onAdd: (profileId: string | null) => void;
}) {
  const withShifts = rows
    .map((row) => ({ row, list: cell(row.id, day) }))
    .filter((r) => r.list.length > 0);

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
                          : (s.title ??
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

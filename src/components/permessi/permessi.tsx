"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  apriAssenza,
  chiudiAssenza,
  eliminaAssenza,
} from "@/app/(app)/assenze-actions";
import {
  chiediPermesso,
  decidiRichiesta,
  ritiraRichiesta,
} from "@/app/(app)/permessi/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { CAUSALI, ETICHETTA } from "@/lib/assenze";
import { dayShort, fromISODate, isToday, toISODate } from "@/lib/date";
import type { Absence, Department, Profile, VacationRequest } from "@/lib/types";
import { addDays } from "@/lib/week";
import { cn } from "@/lib/utils";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function spostaMese(mese: string, passo: number): string {
  const [y, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Giulia V.": in una cella di calendario il cognome intero non ci sta. */
function nomeCorto(nome: string): string {
  const [primo, secondo] = nome.split(/\s+/);
  return secondo ? `${primo} ${secondo[0].toUpperCase()}.` : primo;
}

/** «12 – 19 agosto», «30 agosto – 2 settembre», «12 agosto» se un giorno. */
function periodo(start: string, end: string | null): string {
  const giorno = (iso: string) => Number(iso.slice(8));
  const mese = (iso: string) => MESI[Number(iso.slice(5, 7)) - 1];
  if (end === null) return `dal ${giorno(start)} ${mese(start)}, in corso`;
  if (start === end) return `${giorno(start)} ${mese(start)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${giorno(start)} – ${giorno(end)} ${mese(end)}`;
  }
  return `${giorno(start)} ${mese(start)} – ${giorno(end)} ${mese(end)}`;
}

/** Le tendine delle causali, raggruppate come le pensa chi compila. */
function OpzioniCausale() {
  return (
    <>
      {CAUSALI.map((g) => (
        <optgroup key={g.gruppo} label={g.gruppo}>
          {g.voci.map(([codice, nome]) => (
            <option key={codice} value={codice}>
              {nome}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** Una cosa disegnata sul calendario: una richiesta in sospeso, oppure
 *  un'assenza vera (nata da un'approvazione o registrata dal responsabile).
 *  Le richieste approvate non si disegnano: sul calendario c'è già la loro
 *  assenza, e la stessa persona due volte sullo stesso giorno confonde. */
type Voce =
  | { genere: "richiesta"; richiesta: VacationRequest }
  | { genere: "assenza"; assenza: Absence };

const profiloDi = (v: Voce) =>
  v.genere === "richiesta" ? v.richiesta.profile_id : v.assenza.profile_id;
const causaleDi = (v: Voce) =>
  v.genere === "richiesta" ? v.richiesta.type : v.assenza.type;
const inizioDi = (v: Voce) =>
  v.genere === "richiesta" ? v.richiesta.start_date : v.assenza.start_date;
const fineDi = (v: Voce) =>
  v.genere === "richiesta" ? v.richiesta.end_date : v.assenza.end_date;

export function Permessi({
  mese,
  primo,
  ultimo,
  da,
  a,
  persone,
  reparti,
  richieste,
  assenze,
  mioId,
  capo,
}: {
  mese: string; // YYYY-MM
  primo: string;
  ultimo: string;
  /** Estremi della griglia: dal lunedì alla domenica che la chiudono. */
  da: string;
  a: string;
  persone: Profile[];
  reparti: Department[];
  richieste: VacationRequest[];
  /** Già filtrate dal database: le proprie, le ferie altrui, tutto al capo. */
  assenze: Absence[];
  mioId: string;
  capo: boolean;
}) {
  const router = useRouter();
  const [inCorso, startNavigazione] = React.useTransition();
  const [filtroReparto, setFiltroReparto] = React.useState("");
  /** Causali spente dal box «Mostra» del responsabile. In memoria e basta:
   *  «di base vede tutto», a ogni apertura si riparte puliti. */
  const [causaliSpente, setCausaliSpente] = React.useState<ReadonlySet<string>>(
    new Set(),
  );
  const [chiedo, setChiedo] = React.useState(false);
  const [registro, setRegistro] = React.useState(false);
  const [dettaglio, setDettaglio] = React.useState<Voce | null>(null);

  const vai = (m: string) =>
    startNavigazione(() => router.push(`/permessi?m=${m}`, { scroll: false }));

  const perId = React.useMemo(
    () => new Map(persone.map((p) => [p.id, p])),
    [persone],
  );

  const voci: Voce[] = React.useMemo(
    () => [
      ...richieste
        .filter((r) => r.status === "richiesta")
        .map((richiesta) => ({ genere: "richiesta", richiesta }) as const),
      ...assenze.map((assenza) => ({ genere: "assenza", assenza }) as const),
    ],
    [richieste, assenze],
  );

  // Il filtro per reparto guarda il principale di appartenenza: le assenze
  // sono della persona, non del turno.
  const passaFiltri = (v: Voce) => {
    const persona = perId.get(profiloDi(v));
    if (!persona) return false;
    if (filtroReparto && persona.department_id !== filtroReparto) return false;
    if (capo && causaliSpente.has(causaleDi(v))) return false;
    return true;
  };

  const visibili = voci.filter(passaFiltri);

  const causaliPresenti = React.useMemo(
    () => [...new Set(voci.map(causaleDi))].sort((x, y) => x.localeCompare(y)),
    [voci],
  );

  const daConfermare = richieste.filter(
    (r) =>
      r.status === "richiesta" &&
      passaFiltri({ genere: "richiesta", richiesta: r }),
  );
  const mie = richieste.filter((r) => r.profile_id === mioId);

  const settimane = React.useMemo(() => {
    const giorni: string[] = [];
    for (let g = da; g <= a; g = addDays(g, 1)) giorni.push(g);
    const fuori: string[][] = [];
    for (let i = 0; i < giorni.length; i += 7) fuori.push(giorni.slice(i, i + 7));
    return fuori;
  }, [da, a]);

  // Un'assenza aperta copre qualunque giorno dopo il suo inizio.
  const nelGiorno = (g: string) =>
    visibili.filter((v) => {
      const fine = fineDi(v);
      return inizioDi(v) <= g && (fine === null || g <= fine);
    });

  const titolo = `${MESI[Number(mese.slice(5)) - 1]} ${mese.slice(0, 4)}`;
  const meseCorrente = toISODate(new Date()).slice(0, 7) === mese;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface shadow-soft">
            <button
              type="button"
              aria-label="Mese precedente"
              onClick={() => vai(spostaMese(mese, -1))}
              className="tap grid h-9 w-9 place-items-center rounded-l-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="w-px self-stretch bg-border" />
            <button
              type="button"
              aria-label="Mese successivo"
              onClick={() => vai(spostaMese(mese, 1))}
              className="tap grid h-9 w-9 place-items-center rounded-r-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <p
            className="text-[15px] font-semibold capitalize tracking-tight"
            aria-live="polite"
            data-pending={inCorso || undefined}
          >
            {titolo}
          </p>
          {!meseCorrente ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => vai(toISODate(new Date()).slice(0, 7))}
            >
              Oggi
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {reparti.length > 0 ? (
            <Select
              aria-label="Filtra per reparto"
              value={filtroReparto}
              onChange={(e) => setFiltroReparto(e.target.value)}
              className="w-auto min-w-36"
            >
              <option value="">Tutti i reparti</option>
              {reparti.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : null}
          {capo && causaliPresenti.length > 1 ? (
            <FiltroCausali
              causali={causaliPresenti}
              spente={causaliSpente}
              onCambia={setCausaliSpente}
            />
          ) : null}
          {capo ? (
            <Button variant="secondary" size="sm" onClick={() => setRegistro(true)}>
              <CalendarPlus className="size-3.5" />
              <span className="hidden sm:inline">Registra assenza</span>
              <span className="sm:hidden">Registra</span>
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setChiedo(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Chiedi un permesso</span>
            <span className="sm:hidden">Chiedi</span>
          </Button>
        </div>
      </div>

      {capo && daConfermare.length > 0 ? (
        <DaConfermare richieste={daConfermare} perId={perId} onApri={setDettaglio} />
      ) : null}

      {/* ------------------------------------------------- il calendario */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {settimane[0].map((g) => (
            <p
              key={g}
              className="px-1 py-2 text-center text-[11px] font-medium capitalize text-faint"
            >
              {dayShort(fromISODate(g))}
            </p>
          ))}
        </div>

        {settimane.map((sett) => (
          <div
            key={sett[0]}
            className="grid grid-cols-7 border-b border-border last:border-b-0"
          >
            {sett.map((g) => {
              const delMese = g >= primo && g <= ultimo;
              const oggi = isToday(fromISODate(g));
              return (
                <div
                  key={g}
                  className={cn(
                    // min-w-0: in una griglia i figli non si stringono sotto
                    // il loro contenuto, e i nomi lunghi facevano debordare
                    // le celle una sull'altra da telefono.
                    "min-h-16 min-w-0 border-l border-border p-1 first:border-l-0 sm:min-h-20",
                    !delMese && "bg-surface-2/60",
                    oggi && "bg-accent-soft/40",
                  )}
                >
                  <p
                    className={cn(
                      "px-0.5 text-[11.5px] tabular-nums",
                      oggi
                        ? "font-semibold text-accent"
                        : delMese
                          ? "text-muted"
                          : "text-faint",
                    )}
                  >
                    {Number(g.slice(8))}
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {nelGiorno(g).map((v) => {
                      const chiave =
                        v.genere === "richiesta" ? v.richiesta.id : v.assenza.id;
                      const persona = perId.get(profiloDi(v));
                      return (
                        <button
                          key={chiave}
                          type="button"
                          onClick={() => setDettaglio(v)}
                          title={`${persona?.full_name ?? "?"} · ${ETICHETTA(causaleDi(v))}${v.genere === "richiesta" ? " · con riserva" : ""}`}
                          className={cn(
                            "tap block w-full truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium leading-tight",
                            v.genere === "richiesta"
                              ? "border border-dashed border-warning/60 bg-warning-soft text-warning"
                              : causaleDi(v) === "ferie"
                                ? "bg-success-soft text-success"
                                : "bg-accent-soft text-accent",
                          )}
                        >
                          {nomeCorto(persona?.full_name ?? "?")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border border-dashed border-warning/60 bg-warning-soft" />
          con riserva: aspettano il responsabile
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-success-soft" />
          ferie confermate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-accent-soft" />
          altre assenze
        </span>
      </div>

      {mie.length > 0 ? <LeMie richieste={mie} onApri={setDettaglio} /> : null}

      {chiedo ? (
        <ChiediPermesso
          primo={primo}
          onClose={() => setChiedo(false)}
          onFatto={() => {
            setChiedo(false);
            router.refresh();
          }}
        />
      ) : null}

      {registro ? (
        <RegistraAssenza
          persone={persone}
          primo={primo}
          onClose={() => setRegistro(false)}
          onFatto={() => {
            setRegistro(false);
            router.refresh();
          }}
        />
      ) : null}

      {dettaglio ? (
        <Dettaglio
          voce={dettaglio}
          nome={perId.get(profiloDi(dettaglio))?.full_name ?? "Qualcuno"}
          mia={profiloDi(dettaglio) === mioId}
          capo={capo}
          onClose={() => setDettaglio(null)}
          onFatto={() => {
            setDettaglio(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function EtichettaStato({ status }: { status: VacationRequest["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "richiesta" && "bg-warning-soft text-warning",
        status === "approvata" && "bg-success-soft text-success",
        status === "rifiutata" && "bg-surface-3 text-muted",
      )}
    >
      {status === "richiesta"
        ? "con riserva"
        : status === "approvata"
          ? "approvata"
          : "rifiutata"}
    </span>
  );
}

/** Il box del responsabile: quali causali vedere. Parte con tutto acceso. */
function FiltroCausali({
  causali,
  spente,
  onCambia,
}: {
  causali: string[];
  spente: ReadonlySet<string>;
  onCambia: (s: ReadonlySet<string>) => void;
}) {
  const commuta = (c: string) => {
    const dopo = new Set(spente);
    if (dopo.has(c)) dopo.delete(c);
    else dopo.add(c);
    onCambia(dopo);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm">
          <ListFilter className="size-3.5" />
          <span className="hidden sm:inline">Mostra</span>
          {spente.size > 0 ? (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">
              {causali.length - spente.size}/{causali.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-float data-[state=open]:animate-pop"
        >
          <p className="px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-wide text-faint">
            Causali da vedere
          </p>
          {causali.map((c) => (
            <DropdownMenu.CheckboxItem
              key={c}
              checked={!spente.has(c)}
              // Senza il preventDefault il box si chiuderebbe a ogni spunta.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => commuta(c)}
              className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-surface-3"
            >
              <span className="grid size-4 shrink-0 place-items-center rounded border border-border-strong bg-surface-2">
                <DropdownMenu.ItemIndicator>
                  <Check className="size-3 text-accent" />
                </DropdownMenu.ItemIndicator>
              </span>
              {ETICHETTA(c)}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** La coda del responsabile: le richieste che aspettano un sì o un no. */
function DaConfermare({
  richieste,
  perId,
  onApri,
}: {
  richieste: VacationRequest[];
  perId: Map<string, Profile>;
  onApri: (v: Voce) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [inLavorazione, setInLavorazione] = React.useState<string | null>(null);

  const decidi = (r: VacationRequest, approva: boolean) => {
    setInLavorazione(r.id);
    start(async () => {
      const esito = await decidiRichiesta(r.id, approva);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success(approva ? "Richiesta approvata." : "Richiesta rifiutata.");
      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-warning/40 bg-surface shadow-card">
      <p className="border-b border-border bg-warning-soft px-4 py-2.5 text-[13px] font-medium text-warning">
        Da confermare: {richieste.length}
      </p>
      <ul className="divide-y divide-border">
        {richieste.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => onApri({ genere: "richiesta", richiesta: r })}
              className="tap min-w-0 flex-1 text-left"
            >
              <p className="truncate text-[14px] font-medium">
                {perId.get(r.profile_id)?.full_name ?? "?"}
              </p>
              <p className="truncate text-[12.5px] text-muted">
                {ETICHETTA(r.type)} · {periodo(r.start_date, r.end_date)}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </button>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => decidi(r, true)}
                loading={pending && inLavorazione === r.id}
              >
                <Check className="size-3.5" />
                Conferma
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => decidi(r, false)}
                disabled={pending && inLavorazione === r.id}
              >
                <X className="size-3.5" />
                No
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Le proprie, comprese le rifiutate: il calendario quelle non le mostra. */
function LeMie({
  richieste,
  onApri,
}: {
  richieste: VacationRequest[];
  onApri: (v: Voce) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <p className="border-b border-border bg-surface-2 px-4 py-2.5 text-[13px] font-medium text-muted">
        Le mie richieste
      </p>
      <ul className="divide-y divide-border">
        {richieste.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onApri({ genere: "richiesta", richiesta: r })}
              className="tap flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px]">
                {ETICHETTA(r.type)} · {periodo(r.start_date, r.end_date)}
              </span>
              <EtichettaStato status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChiediPermesso({
  primo,
  onClose,
  onFatto,
}: {
  primo: string;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [causale, setCausale] = React.useState("ferie");

  function invia(formData: FormData) {
    start(async () => {
      const esito = await chiediPermesso({
        type: causale,
        start_date: String(formData.get("start_date")),
        end_date: String(formData.get("end_date")),
        note: String(formData.get("note") ?? ""),
      });
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Richiesta inviata: vale quando il responsabile la conferma.");
      onFatto();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Chiedi un permesso"
      description="La richiesta nasce con riserva: vale quando il responsabile la conferma."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="chiedi-permesso" loading={pending}>
            Invia richiesta
          </Button>
        </>
      }
    >
      <form id="chiedi-permesso" action={invia} className="space-y-4">
        <Field label="Causale" htmlFor="permesso-causale">
          <Select
            id="permesso-causale"
            value={causale}
            onChange={(e) => setCausale(e.target.value)}
          >
            <OpzioniCausale />
          </Select>
        </Field>
        {/* In colonna da telefono: due <input type="date"> affiancati non si
            stringono sotto la loro larghezza naturale e si accavallavano. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dal" htmlFor="permesso-dal">
            <Input id="permesso-dal" name="start_date" type="date" defaultValue={primo} required />
          </Field>
          <Field label="Al" htmlFor="permesso-al" hint="Ultimo giorno compreso.">
            <Input id="permesso-al" name="end_date" type="date" defaultValue={primo} required />
          </Field>
        </div>
        <Field label="Nota" htmlFor="permesso-nota" hint="Facoltativa">
          <Textarea id="permesso-nota" name="note" maxLength={300} placeholder="" />
        </Field>
      </form>
    </Modal>
  );
}

/** L'assenza registrata direttamente dal responsabile: vale subito, senza
 *  passare da una richiesta. Era nel pannello della Squadra; vive qui
 *  perché è qui che si guarda il calendario delle assenze. */
function RegistraAssenza({
  persone,
  primo,
  onClose,
  onFatto,
}: {
  persone: Profile[];
  primo: string;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [causale, setCausale] = React.useState("malattia");

  function invia(formData: FormData) {
    const fine = String(formData.get("end_date") ?? "");
    start(async () => {
      const esito = await apriAssenza({
        profile_id: String(formData.get("profile_id")),
        type: causale,
        start_date: String(formData.get("start_date")),
        end_date: fine === "" ? null : fine,
        note: String(formData.get("note") ?? "").trim() || null,
      });
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Assenza registrata.");
      onFatto();
    });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registra un'assenza"
      description="Vale subito, senza passare da una richiesta."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="registra-assenza" loading={pending}>
            Registra
          </Button>
        </>
      }
    >
      <form id="registra-assenza" action={invia} className="space-y-4">
        <Field label="Chi" htmlFor="assenza-persona">
          <Select id="assenza-persona" name="profile_id" required defaultValue="">
            <option value="" disabled>
              — Scegli una persona —
            </option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Causale" htmlFor="assenza-causale">
          <Select
            id="assenza-causale"
            value={causale}
            onChange={(e) => setCausale(e.target.value)}
          >
            <OpzioniCausale />
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dal" htmlFor="assenza-dal">
            <Input id="assenza-dal" name="start_date" type="date" defaultValue={primo} required />
          </Field>
          <Field
            label="Al"
            htmlFor="assenza-al"
            hint="Vuoto = in corso, finché non si segna il rientro."
          >
            <Input id="assenza-al" name="end_date" type="date" />
          </Field>
        </div>
        <Field label="Nota" htmlFor="assenza-nota" hint="Facoltativa">
          <Textarea id="assenza-nota" name="note" maxLength={300} placeholder="" />
        </Field>
      </form>
    </Modal>
  );
}

function Dettaglio({
  voce,
  nome,
  mia,
  capo,
  onClose,
  onFatto,
}: {
  voce: Voce;
  nome: string;
  mia: boolean;
  capo: boolean;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [rientro, setRientro] = React.useState(() => toISODate(new Date()));
  const [confermaElimina, setConfermaElimina] = React.useState(false);

  const esegui = (
    azione: () => Promise<{ ok: true } | { ok: false; error: string }>,
    fatto: string,
  ) =>
    start(async () => {
      const esito = await azione();
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success(fatto);
      onFatto();
    });

  const causale = causaleDi(voce);
  const quando = periodo(inizioDi(voce), fineDi(voce));
  const nota = voce.genere === "richiesta" ? voce.richiesta.note : voce.assenza.note;

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={nome}
      description={`${ETICHETTA(causale)} · ${quando}`}
      footer={
        voce.genere === "richiesta" ? (
          <>
            {mia && voce.richiesta.status === "richiesta" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-danger hover:bg-danger-soft"
                onClick={() =>
                  esegui(() => ritiraRichiesta(voce.richiesta.id), "Richiesta ritirata.")
                }
                loading={pending}
              >
                Ritira la richiesta
              </Button>
            ) : null}
            {capo ? (
              <>
                {voce.richiesta.status !== "rifiutata" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      esegui(
                        () => decidiRichiesta(voce.richiesta.id, false),
                        voce.richiesta.status === "approvata"
                          ? "Approvazione revocata."
                          : "Richiesta rifiutata.",
                      )
                    }
                    loading={pending}
                  >
                    <X className="size-3.5" />
                    {voce.richiesta.status === "approvata" ? "Revoca" : "Rifiuta"}
                  </Button>
                ) : null}
                {voce.richiesta.status !== "approvata" ? (
                  <Button
                    type="button"
                    onClick={() =>
                      esegui(
                        () => decidiRichiesta(voce.richiesta.id, true),
                        "Richiesta approvata.",
                      )
                    }
                    loading={pending}
                  >
                    <Check className="size-3.5" />
                    Conferma
                  </Button>
                ) : null}
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={onClose}>
                Chiudi
              </Button>
            )}
          </>
        ) : capo ? (
          <>
            {confermaElimina ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-[13px] text-muted">Sicuro?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    esegui(() => eliminaAssenza(voce.assenza.id), "Assenza eliminata.")
                  }
                  loading={pending}
                >
                  Elimina
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfermaElimina(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto text-danger hover:bg-danger-soft"
                onClick={() => setConfermaElimina(true)}
              >
                Elimina
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            Chiudi
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {voce.genere === "richiesta" ? (
          <p className="flex items-center gap-2 text-[13.5px] text-muted">
            Stato: <EtichettaStato status={voce.richiesta.status} />
          </p>
        ) : null}

        {nota ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
            {nota}
          </p>
        ) : null}

        {/* Il rientro da un'assenza aperta: qui per il responsabile. La
            persona lo conferma dai suoi turni, come prima. */}
        {voce.genere === "assenza" && voce.assenza.end_date === null && capo ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3.5">
            <Field
              label="Primo giorno in cui torna"
              htmlFor="dettaglio-rientro"
              hint="L'assenza finisce il giorno prima."
            >
              <Input
                id="dettaglio-rientro"
                type="date"
                value={rientro}
                onChange={(e) => setRientro(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  esegui(
                    () =>
                      chiudiAssenza({ id: voce.assenza.id, primo_giorno: rientro }),
                    "Rientro registrato.",
                  )
                }
                loading={pending}
              >
                Segna il rientro
              </Button>
            </div>
          </div>
        ) : null}

        {voce.genere === "assenza" && voce.assenza.end_date === null && !capo ? (
          <p className="text-[12.5px] text-faint">
            Assenza in corso: il rientro si conferma dalla pagina «I miei turni».
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

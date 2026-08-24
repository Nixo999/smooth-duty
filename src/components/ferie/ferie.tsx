"use client";

import { Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { chiediFerie, decidiRichiesta, ritiraRichiesta } from "@/app/(app)/ferie/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dayShort, fromISODate, isToday, toISODate } from "@/lib/date";
import type { Department, VacationRequest } from "@/lib/types";
import { addDays } from "@/lib/week";
import { cn } from "@/lib/utils";

/** Alla pagina delle ferie di una persona servono tre cose sole. */
export type PersonaFerie = {
  id: string;
  full_name: string;
  department_id: string | null;
};

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

const STATO = {
  richiesta: "con riserva",
  approvata: "confermate",
  rifiutata: "rifiutate",
} as const;

export function Ferie({
  mese,
  primo,
  ultimo,
  da,
  a,
  persone,
  reparti,
  richieste,
  mioId,
  capo,
}: {
  mese: string; // YYYY-MM
  primo: string;
  ultimo: string;
  /** Estremi della griglia: dal lunedì alla domenica che la chiudono. */
  da: string;
  a: string;
  persone: PersonaFerie[];
  reparti: Department[];
  richieste: VacationRequest[];
  mioId: string;
  capo: boolean;
}) {
  const router = useRouter();
  const [inCorso, startNavigazione] = React.useTransition();
  const [filtroReparto, setFiltroReparto] = React.useState("");
  const [chiedo, setChiedo] = React.useState(false);
  const [dettaglio, setDettaglio] = React.useState<VacationRequest | null>(null);

  const vai = (m: string) =>
    startNavigazione(() => router.push(`/ferie?m=${m}`, { scroll: false }));

  const perId = React.useMemo(
    () => new Map(persone.map((p) => [p.id, p])),
    [persone],
  );

  // Il filtro guarda il reparto principale di appartenenza, come chiesto:
  // le ferie sono della persona, non del turno.
  const delReparto = (r: VacationRequest) =>
    !filtroReparto || perId.get(r.profile_id)?.department_id === filtroReparto;

  // Sul calendario le rifiutate non esistono: mostrano un no, e un no non
  // occupa giorni. Restano nella lista di chi le ha chieste.
  const visibili = richieste.filter((r) => r.status !== "rifiutata" && delReparto(r));

  const daConfermare = richieste.filter((r) => r.status === "richiesta" && delReparto(r));
  const mie = richieste.filter((r) => r.profile_id === mioId);

  const settimane = React.useMemo(() => {
    const giorni: string[] = [];
    for (let g = da; g <= a; g = addDays(g, 1)) giorni.push(g);
    const fuori: string[][] = [];
    for (let i = 0; i < giorni.length; i += 7) fuori.push(giorni.slice(i, i + 7));
    return fuori;
  }, [da, a]);

  const nelGiorno = (g: string) =>
    visibili.filter((r) => r.start_date <= g && g <= r.end_date);

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
              className="w-auto min-w-40"
            >
              <option value="">Tutti i reparti</option>
              {reparti.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Button size="sm" onClick={() => setChiedo(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Chiedi ferie</span>
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
          <div key={sett[0]} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {sett.map((g) => {
              const delMese = g >= primo && g <= ultimo;
              const oggi = isToday(fromISODate(g));
              return (
                <div
                  key={g}
                  className={cn(
                    "min-h-16 border-l border-border p-1 first:border-l-0 sm:min-h-20",
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
                    {nelGiorno(g).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setDettaglio(r)}
                        title={`${perId.get(r.profile_id)?.full_name ?? "?"} · ferie ${STATO[r.status]}`}
                        className={cn(
                          "tap block w-full truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium leading-tight",
                          r.status === "richiesta"
                            ? "border border-dashed border-warning/60 bg-warning-soft text-warning"
                            : "bg-success-soft text-success",
                        )}
                      >
                        {nomeCorto(perId.get(r.profile_id)?.full_name ?? "?")}
                      </button>
                    ))}
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
          confermate
        </span>
      </div>

      {mie.length > 0 ? <LeMie richieste={mie} onApri={setDettaglio} /> : null}

      {chiedo ? (
        <ChiediFerie
          primo={primo}
          onClose={() => setChiedo(false)}
          onFatto={() => {
            setChiedo(false);
            router.refresh();
          }}
        />
      ) : null}

      {dettaglio ? (
        <Dettaglio
          richiesta={dettaglio}
          nome={perId.get(dettaglio.profile_id)?.full_name ?? "Qualcuno"}
          mia={dettaglio.profile_id === mioId}
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

/** «12 – 19 agosto», «30 agosto – 2 settembre», «12 agosto» se un giorno. */
function periodo(r: VacationRequest): string {
  const giorno = (iso: string) => Number(iso.slice(8));
  const mese = (iso: string) => MESI[Number(iso.slice(5, 7)) - 1];
  if (r.start_date === r.end_date) return `${giorno(r.start_date)} ${mese(r.start_date)}`;
  if (r.start_date.slice(0, 7) === r.end_date.slice(0, 7)) {
    return `${giorno(r.start_date)} – ${giorno(r.end_date)} ${mese(r.end_date)}`;
  }
  return `${giorno(r.start_date)} ${mese(r.start_date)} – ${giorno(r.end_date)} ${mese(r.end_date)}`;
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
      {status === "richiesta" ? "con riserva" : status === "approvata" ? "confermate" : "rifiutate"}
    </span>
  );
}

/** La coda del responsabile: le richieste che aspettano un sì o un no. */
function DaConfermare({
  richieste,
  perId,
  onApri,
}: {
  richieste: VacationRequest[];
  perId: Map<string, PersonaFerie>;
  onApri: (r: VacationRequest) => void;
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
      toast.success(approva ? "Ferie confermate." : "Richiesta rifiutata.");
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
              onClick={() => onApri(r)}
              className="tap min-w-0 flex-1 text-left"
            >
              <p className="truncate text-[14px] font-medium">
                {perId.get(r.profile_id)?.full_name ?? "?"}
              </p>
              <p className="text-[12.5px] text-muted">
                {periodo(r)}
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
  onApri: (r: VacationRequest) => void;
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
              onClick={() => onApri(r)}
              className="tap flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-2"
            >
              <span className="flex-1 text-[13.5px]">{periodo(r)}</span>
              <EtichettaStato status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChiediFerie({
  primo,
  onClose,
  onFatto,
}: {
  primo: string;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [pending, start] = React.useTransition();

  function invia(formData: FormData) {
    start(async () => {
      const esito = await chiediFerie({
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
      title="Chiedi ferie"
      description="La richiesta nasce con riserva: vale quando il responsabile la conferma."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" form="chiedi-ferie" loading={pending}>
            Invia richiesta
          </Button>
        </>
      }
    >
      <form id="chiedi-ferie" action={invia} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dal" htmlFor="ferie-dal">
            <Input id="ferie-dal" name="start_date" type="date" defaultValue={primo} required />
          </Field>
          <Field label="Al" htmlFor="ferie-al" hint="Ultimo giorno compreso.">
            <Input id="ferie-al" name="end_date" type="date" defaultValue={primo} required />
          </Field>
        </div>
        <Field label="Nota" htmlFor="ferie-nota" hint="Facoltativa — es. matrimonio di mia sorella">
          <Textarea id="ferie-nota" name="note" maxLength={300} placeholder="" />
        </Field>
      </form>
    </Modal>
  );
}

function Dettaglio({
  richiesta,
  nome,
  mia,
  capo,
  onClose,
  onFatto,
}: {
  richiesta: VacationRequest;
  nome: string;
  mia: boolean;
  capo: boolean;
  onClose: () => void;
  onFatto: () => void;
}) {
  const [pending, start] = React.useTransition();

  const esegui = (azione: () => Promise<{ ok: true } | { ok: false; error: string }>, fatto: string) =>
    start(async () => {
      const esito = await azione();
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success(fatto);
      onFatto();
    });

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={nome}
      description={`Ferie · ${periodo(richiesta)}`}
      footer={
        <>
          {mia && richiesta.status === "richiesta" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-auto text-danger hover:bg-danger-soft"
              onClick={() =>
                esegui(() => ritiraRichiesta(richiesta.id), "Richiesta ritirata.")
              }
              loading={pending}
            >
              Ritira la richiesta
            </Button>
          ) : null}
          {capo ? (
            <>
              {richiesta.status !== "rifiutata" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    esegui(
                      () => decidiRichiesta(richiesta.id, false),
                      richiesta.status === "approvata"
                        ? "Conferma revocata."
                        : "Richiesta rifiutata.",
                    )
                  }
                  loading={pending}
                >
                  <X className="size-3.5" />
                  {richiesta.status === "approvata" ? "Revoca" : "Rifiuta"}
                </Button>
              ) : null}
              {richiesta.status !== "approvata" ? (
                <Button
                  type="button"
                  onClick={() =>
                    esegui(() => decidiRichiesta(richiesta.id, true), "Ferie confermate.")
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
      }
    >
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[13.5px] text-muted">
          Stato: <EtichettaStato status={richiesta.status} />
        </p>
        {richiesta.note ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
            {richiesta.note}
          </p>
        ) : null}
        {richiesta.status === "approvata" ? (
          <p className="text-[12.5px] text-faint">
            La conferma ha creato l&apos;assenza: i turni di quei giorni si vedono in
            trasparenza e non contano.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

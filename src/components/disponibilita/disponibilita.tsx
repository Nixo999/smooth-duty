"use client";

import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  segnaDisponibilita,
  togliDisponibilita,
} from "@/app/(app)/disponibilita/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dayShort, fromISODate, isToday, oggiCivile } from "@/lib/date";
import {
  descriviStato,
  statoDelGiorno,
  versoDelRegime,
  type Dichiarazione,
  type RegimeChiamata,
} from "@/lib/disponibilita";
import type { Disponibilita as Riga, Profile } from "@/lib/types";
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

/** Come si chiama questo calendario, secondo il verso in cui si parla.
 *
 *  Le stesse caselle colorate vogliono dire il contrario nei due regimi, e
 *  una schermata che dicesse «giorni segnati» lascerebbe indovinare quale
 *  dei due. È l'unico posto in cui l'ambiguità costerebbe una persona
 *  mandata a lavorare in un giorno in cui aveva detto di non esserci. */
const PAROLE: Record<
  "non_posso" | "posso",
  { titolo: string; io: string; capo: string; segna: string; pastiglia: string }
> = {
  non_posso: {
    titolo: "Quando non puoi",
    io: "Segna i giorni in cui non sei disponibile. Tutti gli altri restano liberi, e il responsabile ci può contare.",
    capo: "I giorni che le persone a chiamata hanno escluso. In quei giorni l'app non ti lascia dare turni.",
    segna: "Non posso",
    pastiglia: "non posso",
  },
  posso: {
    titolo: "Quando puoi",
    io: "Segna i giorni in cui sei disponibile. Fuori da quelli non ti verranno dati turni: quello che non segni non esiste.",
    capo: "I giorni in cui le persone a chiamata si sono rese disponibili. Fuori da lì non gli puoi dare turni.",
    segna: "Sono disponibile",
    pastiglia: "posso",
  },
};

export function Disponibilita({
  mese,
  primo,
  ultimo,
  da,
  a,
  regime,
  persone,
  righe,
  giorniConTurno,
  mioId,
  capo,
}: {
  mese: string; // YYYY-MM
  primo: string;
  ultimo: string;
  da: string;
  a: string;
  regime: RegimeChiamata;
  /** Solo chi è a chiamata e attivo: gli altri qui non c'entrano. */
  persone: Profile[];
  righe: Riga[];
  /** `profileId|YYYY-MM-DD` per ogni turno già scritto nel mese. Serve a
   *  dichiarare guardando dove si è già impegnati, non a memoria. */
  giorniConTurno: string[];
  mioId: string;
  capo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const verso = versoDelRegime(regime) ?? "non_posso";
  const parole = PAROLE[verso];
  const oggi = oggiCivile();

  /** Di chi è il calendario aperto. Il dipendente ha solo il suo; il
   *  responsabile parte da «tutti», perché la prima domanda che si fa
   *  aprendo questa pagina è chi c'è questa settimana, non cosa ha detto
   *  una persona in particolare. */
  const [chi, setChi] = React.useState<string>(capo ? "" : mioId);
  const [scelti, setScelti] = React.useState<Set<string>>(new Set());
  const [oreAperte, setOreAperte] = React.useState(false);
  const [dalle, setDalle] = React.useState("09:00");
  const [alle, setAlle] = React.useState("13:00");
  const [nota, setNota] = React.useState("");

  const conTurno = React.useMemo(() => new Set(giorniConTurno), [giorniConTurno]);

  /** Le dichiarazioni per persona, già filtrate sul verso che conta. */
  const perPersona = React.useMemo(() => {
    const map = new Map<string, Dichiarazione[]>();
    for (const r of righe) {
      const lista = map.get(r.profile_id);
      const riga: Dichiarazione = {
        giorno: r.giorno,
        dalle: r.dalle,
        alle: r.alle,
        verso: r.verso,
      };
      if (lista) lista.push(riga);
      else map.set(r.profile_id, [riga]);
    }
    return map;
  }, [righe]);

  const statoDi = (profileId: string, giorno: string) =>
    statoDelGiorno({
      regime,
      dichiarazioni: perPersona.get(profileId) ?? [],
      giorno,
    });

  const settimane = React.useMemo(() => {
    const giorni: string[] = [];
    for (let g = da; g <= a; g = addDays(g, 1)) giorni.push(g);
    const righeSett: string[][] = [];
    for (let i = 0; i < giorni.length; i += 7) righeSett.push(giorni.slice(i, i + 7));
    return righeSett;
  }, [da, a]);

  const vaiA = (m: string) => router.push(`/disponibilita?m=${m}`, { scroll: false });

  const alterna = (giorno: string) => {
    if (giorno < oggi || !chi) return;
    setScelti((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(giorno)) dopo.delete(giorno);
      else dopo.add(giorno);
      return dopo;
    });
  };

  const finito = (messaggio: string) => {
    setScelti(new Set());
    setOreAperte(false);
    setNota("");
    toast.success(messaggio);
    router.refresh();
  };

  const segnaIntero = () =>
    start(async () => {
      const esito = await segnaDisponibilita({
        profile_id: chi,
        giorni: [...scelti],
        dalle: null,
        alle: null,
        nota,
      });
      if (!esito.ok) return void toast.error(esito.error);
      finito(scelti.size === 1 ? "Giorno segnato." : `${scelti.size} giorni segnati.`);
    });

  const segnaOre = () =>
    start(async () => {
      const esito = await segnaDisponibilita({
        profile_id: chi,
        giorni: [...scelti],
        dalle,
        alle,
        nota,
      });
      if (!esito.ok) return void toast.error(esito.error);
      finito("Ore segnate.");
    });

  const togli = () =>
    start(async () => {
      const esito = await togliDisponibilita({ profile_id: chi, giorni: [...scelti] });
      if (!esito.ok) return void toast.error(esito.error);
      finito("Tolto.");
    });

  const nomeDi = (id: string) =>
    persone.find((p) => p.id === id)?.full_name ?? "questa persona";

  /* -------------------------------------------------------------------- */

  if (persone.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Intestazione titolo={parole.titolo} spiega={capo ? parole.capo : parole.io} />
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
          <CalendarClock className="mx-auto size-6 text-faint" />
          <p className="mt-2 text-[14px] font-medium">
            Nessuno lavora a chiamata
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Questo calendario è di chi ha «a chiamata» nella sua scheda. Il tipo
            di contratto si sceglie in Squadra.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <Intestazione titolo={parole.titolo} spiega={capo ? parole.capo : parole.io} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Mese precedente"
            onClick={() => vaiA(spostaMese(mese, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-[9.5rem] text-center text-[14.5px] font-semibold capitalize tracking-tight">
            {MESI[Number(mese.slice(5, 7)) - 1]} {mese.slice(0, 4)}
          </p>
          <Button
            size="icon"
            variant="secondary"
            aria-label="Mese successivo"
            onClick={() => vaiA(spostaMese(mese, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {capo ? (
          <Select
            value={chi}
            onChange={(e) => {
              setChi(e.target.value);
              setScelti(new Set());
            }}
            aria-label="Di chi è il calendario"
            className="w-auto min-w-[11rem]"
          >
            <option value="">Tutti · sola lettura</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {capo && !chi ? (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted">
          Stai guardando tutta la squadra. Per segnare qualcosa al posto di
          qualcuno — perché ti ha telefonato, di solito — scegli il suo nome
          qui sopra.
        </p>
      ) : null}

      {/* ------------------------------------------------- il calendario --- */}
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
              const passato = g < oggi;
              const scelto = scelti.has(g);
              const stato = chi ? statoDi(chi, g) : null;

              return (
                <button
                  key={g}
                  type="button"
                  // Sui giorni passati non c'è più niente da dire, e senza
                  // una persona scelta non c'è niente su cui scriverlo: in
                  // tutti e due i casi il tocco non deve fingere di fare
                  // qualcosa.
                  disabled={passato || !chi}
                  onClick={() => alterna(g)}
                  aria-pressed={scelto}
                  aria-label={`${g}${stato ? ` · ${descriviStato(stato)}` : ""}`}
                  className={cn(
                    // min-w-0: in una griglia i figli non si stringono sotto
                    // il loro contenuto, e i nomi lunghi debordano da una
                    // cella all'altra da telefono.
                    "relative min-h-16 min-w-0 border-l border-border p-1 text-left align-top first:border-l-0 sm:min-h-20",
                    !delMese && "bg-surface-2/60",
                    passato && "opacity-45",
                    !passato && chi && "hover:bg-surface-2",
                    isToday(fromISODate(g)) && "bg-accent-soft/40",
                    scelto && "ring-2 ring-inset ring-accent",
                  )}
                >
                  <span className="flex items-center gap-1 px-0.5">
                    <span
                      className={cn(
                        "text-[11.5px] tabular-nums",
                        isToday(fromISODate(g))
                          ? "font-semibold text-accent"
                          : delMese
                            ? "text-muted"
                            : "text-faint",
                      )}
                    >
                      {Number(g.slice(8))}
                    </span>
                    {chi && conTurno.has(`${chi}|${g}`) ? (
                      <span
                        title="Hai già un turno questo giorno"
                        className="size-1.5 rounded-full bg-accent"
                      />
                    ) : null}
                  </span>

                  {chi ? (
                    stato ? (
                      <span
                        className={cn(
                          "mt-0.5 block truncate rounded px-1 py-0.5 text-[10.5px] font-medium leading-tight",
                          verso === "non_posso"
                            ? "bg-danger-soft text-danger"
                            : "bg-success-soft text-success",
                        )}
                      >
                        {stato.intero
                          ? parole.pastiglia
                          : stato.fasce
                              .map((f) => `${f.dalle}–${f.alle}`)
                              .join(" ")}
                      </span>
                    ) : null
                  ) : (
                    <span className="mt-0.5 block space-y-0.5">
                      {persone.map((p) => {
                        const s = statoDi(p.id, g);
                        if (!s) return null;
                        return (
                          <span
                            key={p.id}
                            title={`${p.full_name} · ${descriviStato(s)}`}
                            className={cn(
                              "block truncate rounded px-1 py-0.5 text-[10.5px] font-medium leading-tight",
                              verso === "non_posso"
                                ? "bg-danger-soft text-danger"
                                : "bg-success-soft text-success",
                            )}
                          >
                            {nomeCorto(p.full_name)}
                            {s.intero ? "" : ` ${s.fasce[0]?.dalle ?? ""}`}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {chi && scelti.size === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">
          Tocca i giorni, poi scegli cosa farne. Si possono prendere anche più
          giorni insieme — tutto un weekend, o un mese intero.
        </p>
      ) : null}

      {/* ------------------------------------ la barra di quello che hai scelto */}
      {scelti.size > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 shadow-float backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <p className="mr-auto text-[13px] font-medium">
              {scelti.size === 1 ? "1 giorno scelto" : `${scelti.size} giorni scelti`}
              {capo && chi !== mioId ? (
                <span className="text-muted"> · {nomeDi(chi)}</span>
              ) : null}
            </p>
            <Button size="sm" onClick={segnaIntero} loading={pending} disabled={pending}>
              <Check className="size-3.5" />
              {parole.segna}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOreAperte(true)}
              disabled={pending}
            >
              <Clock className="size-3.5" />
              Solo alcune ore
            </Button>
            <Button size="sm" variant="danger" onClick={togli} disabled={pending}>
              <Trash2 className="size-3.5" />
              Togli
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Lascia stare"
              onClick={() => setScelti(new Set())}
              disabled={pending}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- le ore --- */}
      <Modal
        open={oreAperte}
        onOpenChange={setOreAperte}
        title={verso === "non_posso" ? "Non posso in queste ore" : "Posso in queste ore"}
        description={
          scelti.size === 1
            ? "Vale per il giorno che hai scelto."
            : `Le stesse ore su tutti e ${scelti.size} i giorni scelti.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOreAperte(false)} disabled={pending}>
              Lascia stare
            </Button>
            <Button onClick={segnaOre} loading={pending} disabled={pending}>
              Segna le ore
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Dalle – alle" htmlFor="dalle">
            <div className="flex items-center gap-2">
              <Input
                id="dalle"
                type="time"
                value={dalle}
                onChange={(e) => setDalle(e.target.value)}
                className="w-32"
              />
              <span className="text-faint">–</span>
              <Input
                type="time"
                value={alle}
                onChange={(e) => setAlle(e.target.value)}
                className="w-32"
                aria-label="Fine"
              />
            </div>
          </Field>
          <p className="text-[12.5px] text-faint">
            Se l&apos;ora di fine è prima di quella di inizio, la fascia
            scavalca la mezzanotte — come per i turni.
          </p>
          <Field
            label="Una riga per il responsabile"
            htmlFor="nota-disp"
            hint="Facoltativa. Non cambia niente da sola: serve a lui per capire."
          >
            <Textarea
              id="nota-disp"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Il giovedì ho lezione fino alle 18"
              maxLength={200}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Intestazione({ titolo, spiega }: { titolo: string; spiega: string }) {
  return (
    <div>
      <h1 className="text-[19px] font-semibold tracking-tight">{titolo}</h1>
      <p className="text-[13.5px] text-muted">{spiega}</p>
    </div>
  );
}

"use client";

import { Check, ChevronLeft, ChevronRight, Clock, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  segnaDisponibilita,
  togliDisponibilita,
} from "@/app/(app)/disponibilita/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { dayShort, fromISODate, isToday, oggiCivile } from "@/lib/date";
import {
  descriviStato,
  statoDelGiorno,
  versoDelRegime,
  type Dichiarazione,
  type RegimeChiamata,
} from "@/lib/disponibilita";
import type { Disponibilita as Riga } from "@/lib/types";
import { addDays } from "@/lib/week";
import { BARRA_AZIONI, cn } from "@/lib/utils";

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

function spostaMese(mese: string, passo: number): string {
  const [y, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Come si chiama questo calendario, secondo il verso in cui si parla.
 *
 *  Le stesse caselle colorate vogliono dire il contrario nei due regimi, e
 *  una schermata che dicesse «giorni segnati» lascerebbe indovinare quale
 *  dei due. È l'unico posto in cui l'ambiguità costerebbe una persona
 *  mandata a lavorare in un giorno in cui aveva detto di non esserci. */
const PAROLE = {
  non_posso: {
    titolo: "Quando non puoi",
    spiega:
      "Segna i giorni in cui non sei disponibile. Tutti gli altri restano liberi, e il responsabile ci può contare.",
    segna: "Non posso",
    pastiglia: "non posso",
  },
  posso: {
    titolo: "Quando puoi",
    spiega:
      "Segna i giorni in cui sei disponibile. Fuori da quelli non ti verranno dati turni: quello che non segni non esiste.",
    segna: "Sono disponibile",
    pastiglia: "posso",
  },
} as const;

/** Il calendario del dipendente a chiamata: dice quando può, o quando non
 *  può, secondo come l'azienda lo ingaggia.
 *
 *  Il responsabile qui non entra: le stesse dichiarazioni le vede e le scrive
 *  dentro il tabellone, accanto ai turni su cui deve decidere. */
export function Disponibilita({
  mese,
  primo,
  ultimo,
  da,
  a,
  regime,
  righe,
  giorniConTurno,
  mioId,
}: {
  mese: string; // YYYY-MM
  primo: string;
  ultimo: string;
  da: string;
  a: string;
  regime: RegimeChiamata;
  righe: Riga[];
  /** I giorni del mese in cui ha già un turno: si dichiara guardando dove si
   *  è impegnati, non a memoria. */
  giorniConTurno: string[];
  mioId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const verso = versoDelRegime(regime) ?? "non_posso";
  const parole = PAROLE[verso];
  const oggi = oggiCivile();

  const [scelti, setScelti] = React.useState<Set<string>>(new Set());
  const [oreAperte, setOreAperte] = React.useState(false);
  const [dalle, setDalle] = React.useState("09:00");
  const [alle, setAlle] = React.useState("13:00");
  const [nota, setNota] = React.useState("");

  const conTurno = React.useMemo(() => new Set(giorniConTurno), [giorniConTurno]);

  const dichiarazioni: Dichiarazione[] = React.useMemo(
    () =>
      righe.map((r) => ({
        giorno: r.giorno,
        dalle: r.dalle,
        alle: r.alle,
        verso: r.verso,
      })),
    [righe],
  );

  const statoDi = (giorno: string) =>
    statoDelGiorno({ regime, dichiarazioni, giorno });

  const settimane = React.useMemo(() => {
    const giorni: string[] = [];
    for (let g = da; g <= a; g = addDays(g, 1)) giorni.push(g);
    const righeSett: string[][] = [];
    for (let i = 0; i < giorni.length; i += 7) righeSett.push(giorni.slice(i, i + 7));
    return righeSett;
  }, [da, a]);

  const vaiA = (m: string) => router.push(`/disponibilita?m=${m}`, { scroll: false });

  const alterna = (giorno: string) => {
    if (giorno < oggi) return;
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
        profile_id: mioId,
        giorni: [...scelti],
        dalle: null,
        alle: null,
        nota,
      });
      if (!esito.ok) return void toast.error(esito.error);
      finito(
        scelti.size === 1
          ? "Giorno segnato. Da adesso il responsabile lo vede."
          : `${scelti.size} giorni segnati. Da adesso il responsabile li vede.`,
      );
    });

  const segnaOre = () =>
    start(async () => {
      const esito = await segnaDisponibilita({
        profile_id: mioId,
        giorni: [...scelti],
        dalle,
        alle,
        nota,
      });
      if (!esito.ok) return void toast.error(esito.error);
      finito("Ore segnate. Da adesso il responsabile le vede.");
    });

  const togli = () =>
    start(async () => {
      const esito = await togliDisponibilita({ profile_id: mioId, giorni: [...scelti] });
      if (!esito.ok) return void toast.error(esito.error);
      finito("Tolto. Da adesso il responsabile vede la casella libera.");
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{parole.titolo}</h1>
        <p className="text-[13.5px] text-muted">{parole.spiega}</p>
      </div>

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

      {/* ------------------------------------------------- il calendario --- */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {settimane[0].map((g) => (
            <p
              key={g}
              className="px-1 py-2 text-center text-[12px] font-medium capitalize text-faint"
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
              const stato = statoDi(g);

              return (
                <button
                  key={g}
                  type="button"
                  // Sui giorni passati non c'è più niente da dire: il tocco
                  // non deve fingere di fare qualcosa.
                  disabled={passato}
                  onClick={() => alterna(g)}
                  aria-pressed={scelto}
                  aria-label={`${g}${stato ? ` · ${descriviStato(stato)}` : ""}`}
                  className={cn(
                    // min-w-0: in una griglia i figli non si stringono sotto
                    // il loro contenuto, e le fasce orarie facevano debordare
                    // le celle una sull'altra da telefono.
                    "relative min-h-16 min-w-0 border-l border-border p-1 text-left align-top first:border-l-0 sm:min-h-20",
                    !delMese && "bg-surface-2/60",
                    passato && "opacity-45",
                    !passato && "hover:bg-surface-2",
                    isToday(fromISODate(g)) && "bg-accent-soft/40",
                    scelto && "ring-2 ring-inset ring-accent",
                  )}
                >
                  <span className="flex items-center gap-1 px-0.5">
                    <span
                      className={cn(
                        "text-[12px] cifre",
                        isToday(fromISODate(g))
                          ? "font-semibold text-accent"
                          : delMese
                            ? "text-muted"
                            : "text-faint",
                      )}
                    >
                      {Number(g.slice(8))}
                    </span>
                    {conTurno.has(g) ? (
                      <span
                        title="Hai già un turno questo giorno"
                        className="size-1.5 rounded-full bg-accent"
                      />
                    ) : null}
                  </span>

                  {stato ? (
                    <span
                      className={cn(
                        "mt-0.5 block truncate rounded px-1 py-0.5 text-[12px] font-medium leading-tight",
                        verso === "non_posso"
                          ? "bg-danger-soft text-danger"
                          : "bg-success-soft text-success",
                      )}
                    >
                      {stato.intero
                        ? parole.pastiglia
                        : stato.fasce.map((f) => `${f.dalle}–${f.alle}`).join(" ")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {scelti.size === 0 ? (
        <p className="px-1 text-[12.5px] text-muted">
          Tocca i giorni, poi scegli cosa farne. Si possono prendere anche più
          giorni insieme — tutto un weekend, o un mese intero.
        </p>
      ) : null}

      {/* ------------------------------------ la barra di quello che hai scelto */}
      {scelti.size > 0 ? (
        <div className={BARRA_AZIONI}>
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <p className="mr-auto text-[13px] font-medium">
              {scelti.size === 1 ? "1 giorno scelto" : `${scelti.size} giorni scelti`}
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

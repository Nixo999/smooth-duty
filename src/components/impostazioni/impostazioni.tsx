"use client";

import {
  CalendarDays,
  ClipboardList,
  Eye,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { salvaImpostazioni } from "@/app/(app)/impostazioni/actions";
import { Button } from "@/components/ui/button";
import { CAUSALI } from "@/lib/assenze";
import type { Impostazioni as Valori } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

/** Le regole generali dell'azienda, raccolte sotto la pagina a cui si
 *  applicano: chi cerca una regola parte da dove la vede applicata, non da
 *  un elenco di interruttori tutti uguali.
 *
 *  Ogni sezione e' una pagina dell'app. Tre si possono spegnere del tutto —
 *  l'interruttore sta nell'intestazione — e allora quello che contengono
 *  resta li' ma smette di contare, spento anche lui. */
export function Impostazioni({
  valori,
  azienda,
}: {
  valori: Valori;
  azienda: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState<Valori>(valori);

  const cambia = (patch: Partial<Valori>) => setV((prima) => ({ ...prima, ...patch }));

  const commutaCausale = (codice: string) =>
    cambia({
      causali_richiedibili: v.causali_richiedibili.includes(codice)
        ? v.causali_richiedibili.filter((c) => c !== codice)
        : [...v.causali_richiedibili, codice],
    });

  // Nessuna modifica, niente da salvare: il bottone lo dice invece di
  // rispondere «salvate» a chi non ha toccato niente. Le causali si
  // confrontano ordinate: togliere una spunta e rimetterla cambia l'ordine
  // dell'elenco, non le impostazioni.
  const impronta = (x: Valori) =>
    JSON.stringify({ ...x, causali_richiedibili: [...x.causali_richiedibili].sort() });
  const cambiato = impronta(v) !== impronta(valori);

  function salva() {
    start(async () => {
      const esito = await salvaImpostazioni(v);
      if (!esito.ok) {
        toast.error(esito.error);
        return;
      }
      toast.success("Impostazioni salvate.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-[13.5px] text-muted">
          Valgono per tutta l&apos;azienda «{azienda}». Sono divise per pagina:
          quelle che si possono spegnere hanno l&apos;interruttore accanto al
          nome.
        </p>
      </div>

      {/* ------------------------------------------------------- turni --- */}
      <Sezione
        icona={CalendarDays}
        pagina="Turni"
        nota="Quando la squadra viene coinvolta, e come."
      >
        <Nota>
          Il turno vale sempre da subito, anche quando è rifiutabile: qui non
          si chiede un permesso, si segnala una cosa fuori dall&apos;ordinario e
          si lascia la facoltà di dire di no. Chi tace ha accettato — ed è il
          caso di gran lunga più frequente.
        </Nota>

        <Gruppo
          titolo="Quando pubblichi la settimana"
          spiega="È il momento in cui la squadra la vede per la prima volta."
        >
          <Regola>
            Non si pubblica una settimana in cui qualcuno sta{" "}
            <strong className="font-medium text-text">sotto</strong> le sue ore
            da contratto: l&apos;app lo impedisce e ti dice chi e di quanto. In
            bozza invece si può, che è tutto il senso della bozza. Chi è assente
            conta per i giorni in cui c&apos;è, e chi è a chiamata non ha un
            monte ore da rispettare.
          </Regola>
          <Interruttore
            acceso={v.conferma_settimana}
            onCambia={(x) => cambia({ conferma_settimana: x })}
            titolo="Settimana in straordinario da accettare"
            descrizione="Una domanda sola sulla settimana intera, non una per turno: la risposta dipende dall'insieme."
            quando="pubblichi, e a qualcuno la settimana porta oltre le ore da contratto"
            esito="deve scrivere perché, e la settimana la rifai tu: i turni non cambiano da soli"
          />
        </Gruppo>

        <Gruppo
          titolo="Quando cambi un turno già pubblicato"
          spiega="Prima della pubblicazione il tabellone è un foglio di lavoro: correggerlo non chiede niente a nessuno."
        >
          <Interruttore
            acceso={v.conferma_modifiche}
            onCambia={(x) => cambia({ conferma_modifiche: x })}
            titolo="L'interessato viene coinvolto"
            descrizione="Un interruttore solo; è poi la modifica a decidere come. Più ore o turno spostato si chiedono — il mattino e il pomeriggio non sono la stessa giornata, a ore identiche. Ore tolte, turno cancellato o passato a un altro: arriva un avviso che si chiude con «ho letto», perché lì non c'è niente da concedere."
            quando="allunghi, sposti, accorci o cancelli un turno di una settimana pubblicata"
            esito="il turno torna com'era, e tu ricevi il messaggio col motivo"
          />
          <Interruttore
            acceso={v.conferma_cambio_reparto}
            onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
            titolo="Anche il solo cambio di reparto"
            descrizione="Spostare qualcuno dalla cassa alla sala senza togliergli un minuto. Spento — ed è il caso normale — non si segnala nemmeno."
            quando="cambi il reparto e nient'altro: stessa persona, stesso giorno, stessi orari"
            esito="il turno torna al reparto di prima"
          />
        </Gruppo>

        <Gruppo
          titolo="Quando aggiungi un turno"
          spiega="Un turno che non c'era non ha un «prima» a cui tornare."
        >
          <Interruttore
            acceso={v.conferma_straordinari}
            onCambia={(x) => cambia({ conferma_straordinari: x })}
            titolo="Straordinari rifiutabili"
            descrizione="Chi è a chiamata non ha un monte ore, quindi non lo riguarda."
            quando="il turno nuovo porta la persona oltre le sue ore settimanali da contratto"
            esito="il turno salta, e ti resta un buco da coprire che l'app ti tiene in evidenza"
          />
          <Interruttore
            acceso={v.orari_preimpostati}
            onCambia={(x) => cambia({ orari_preimpostati: x })}
            titolo="Orari diversi da quelli del contratto"
            descrizione="L'orario si scrive sulla persona, in Squadra. Chi non ce l'ha scritto non è toccato da questa regola."
            quando="il turno ha un orario diverso da quello preimpostato sul suo contratto"
            esito="il turno salta, come sopra"
          />
        </Gruppo>
      </Sezione>

      {/* ------------------------------------------------ supervisione --- */}
      <Sezione
        icona={Eye}
        pagina="Supervisione"
        nota="La giornata reparto per reparto, con i buchi di copertura."
        accesa={v.pagina_supervisione}
        onCambiaPagina={(x) => cambia({ pagina_supervisione: x })}
      >
        <Interruttore
          acceso={v.supervisione_dipendenti}
          onCambia={(x) => cambia({ supervisione_dipendenti: x })}
          titolo="Visibile anche ai dipendenti"
          descrizione="Spenta, la pagina resta solo al responsabile: ai dipendenti sparisce dal menu."
          spento={!v.pagina_supervisione}
        />
      </Sezione>

      {/* ---------------------------------------------------- permessi --- */}
      <Sezione
        icona={Sun}
        pagina="Permessi"
        nota="Le richieste di assenza dei dipendenti e il calendario di chi manca."
        accesa={v.pagina_permessi}
        onCambiaPagina={(x) => cambia({ pagina_permessi: x })}
      >
        <div className={cn("space-y-3 py-3.5", !v.pagina_permessi && "opacity-45")}>
          <div>
            <p className="text-[14px] font-medium">Causali richiedibili</p>
            <p className="text-[12.5px] text-muted">
              Quello che un dipendente può chiedere da solo. Il responsabile,
              registrando a mano, le ha sempre tutte.
            </p>
          </div>
          {CAUSALI.map((gruppo) => (
            <div key={gruppo.gruppo}>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">
                {gruppo.gruppo}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {gruppo.voci.map(([codice, nome]) => {
                  const dentro = v.causali_richiedibili.includes(codice);
                  return (
                    <button
                      key={codice}
                      type="button"
                      aria-pressed={dentro}
                      disabled={!v.pagina_permessi}
                      onClick={() => commutaCausale(codice)}
                      className={cn(
                        "tap rounded-full px-3 py-1.5 text-[12.5px] font-medium",
                        dentro
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-3 text-faint line-through hover:text-muted",
                      )}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sezione>

      {/* --------------------------------------------------- prospetto --- */}
      <Sezione
        icona={ClipboardList}
        pagina="Prospetto"
        nota="Il riepilogo delle ore per persona, settimana, mese o anno. La vede solo il responsabile."
        accesa={v.pagina_prospetto}
        onCambiaPagina={(x) => cambia({ pagina_prospetto: x })}
      />

      <p className="px-1 text-[12.5px] text-muted">
        Turni, Squadra e Impostazioni non si spengono: senza il tabellone
        l&apos;app non ha più un motivo, senza Squadra non si aggiunge nessuno,
        e da qui si riaccende tutto il resto.
      </p>

      <div className="flex items-center justify-end gap-3">
        {cambiato ? (
          <span className="text-[12.5px] text-warning">Modifiche non salvate</span>
        ) : null}
        <Button onClick={salva} loading={pending} disabled={!cambiato}>
          Salva impostazioni
        </Button>
      </div>
    </div>
  );
}

/** Una pagina dell'app, con le sue regole. Se `onCambiaPagina` c'è, la
 *  pagina si può spegnere: l'interruttore sta nell'intestazione, dove si
 *  legge come parte del nome, e quello che c'è dentro si spegne con lei. */
function Sezione({
  icona: Icona,
  pagina,
  nota,
  accesa = true,
  onCambiaPagina,
  children,
}: {
  icona: LucideIcon;
  pagina: string;
  nota?: string;
  accesa?: boolean;
  onCambiaPagina?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-card transition-colors",
        accesa ? "border-border" : "border-dashed border-border-strong",
      )}
    >
      <header className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            accesa ? "bg-accent-soft text-accent" : "bg-surface-3 text-faint",
          )}
        >
          <Icona className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-semibold">
            {pagina}
            {!accesa ? (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">
                non in uso
              </span>
            ) : null}
          </p>
          {nota ? <p className="text-[12.5px] text-muted">{nota}</p> : null}
        </div>
        {onCambiaPagina ? (
          <Levetta
            acceso={accesa}
            onCambia={onCambiaPagina}
            etichetta={`Usa la pagina ${pagina}`}
          />
        ) : null}
      </header>

      {children ? (
        <div className="divide-y divide-border px-4">{children}</div>
      ) : null}
    </section>
  );
}

function Interruttore({
  acceso,
  onCambia,
  titolo,
  descrizione,
  quando,
  esito,
  spento,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  descrizione: string;
  /** Il gesto che fa scattare la regola: «allunghi un turno», «pubblichi».
   *  Sta su una riga sua perché è la prima cosa che si cerca — «questa mi
   *  riguarda?» — e dentro un paragrafo bisogna trovarla leggendo. */
  quando?: string;
  /** Cosa succede se la persona dice di no. Chi accende un interruttore
   *  vuole sapere dove va a finire, non solo cosa attiva. */
  esito?: string;
  /** La pagina che lo contiene è spenta: la regola resta scritta ma non
   *  vale, e si vede che non vale. */
  spento?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-3.5", spento && "opacity-45")}>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{titolo}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{descrizione}</p>
        {quando || esito ? (
          <dl className="mt-1.5 space-y-0.5 text-[12.5px]">
            {quando ? (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-faint">Quando</dt>
                <dd className="min-w-0 text-muted">{quando}</dd>
              </div>
            ) : null}
            {esito ? (
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-faint">Se dice no</dt>
                <dd className="min-w-0 text-muted">{esito}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
      <Levetta
        acceso={acceso}
        onCambia={onCambia}
        etichetta={titolo}
        disabilitato={spento}
      />
    </div>
  );
}

function Levetta({
  acceso,
  onCambia,
  etichetta,
  disabilitato,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  etichetta: string;
  disabilitato?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      aria-label={etichetta}
      disabled={disabilitato}
      onClick={() => onCambia(!acceso)}
      className={cn(
        // L'anello interno invece di un bordo: un bordo vero sposterebbe di
        // un pixel la pallina, che e' posizionata dentro la scatola.
        "tap relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
        acceso ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-surface shadow-soft transition-[left]",
          acceso ? "left-[1.375rem]" : "left-0.5",
        )}
      />
    </button>
  );
}


/** Un gruppo di interruttori dentro una sezione.
 *
 *  Esiste perché sotto «Turni» ce ne sono sei, e un elenco piatto di sei
 *  levette obbliga a leggerle tutte per capire quale riguarda il gesto che
 *  si sta facendo. Il titolo non è una categoria: è il momento in cui quella
 *  regola scatta — pubblichi, cambi, aggiungi. */
function Gruppo({
  titolo,
  spiega,
  children,
}: {
  titolo: string;
  spiega: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3.5">
      <p className="text-[13px] font-semibold tracking-tight">{titolo}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">{spiega}</p>
      <div className="mt-1 divide-y divide-border">{children}</div>
    </div>
  );
}


/** Una premessa in cima a una sezione: vale per tutte le regole che seguono,
 *  e ripeterla dentro ognuna le allungherebbe tutte. */
function Nota({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-3.5 text-[12.5px] leading-relaxed text-muted">{children}</p>
  );
}

/** Una regola che **non** è un interruttore: vale sempre, non si spegne.
 *  Sta qui in mezzo alle levette perché è lì che uno la cerca — e perché
 *  scoprirla solo nel momento in cui l'app dice di no sarebbe peggio. */
function Regola({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <div className="rounded-xl bg-surface-2 px-3.5 py-3">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
          Sempre attiva
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

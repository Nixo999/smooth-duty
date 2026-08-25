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
        nota="Quando la squadra viene coinvolta, e in che modo. Sono raggruppate per gesto tuo: quello che cambia non è un'opzione, è cosa succede quando premi un bottone."
      >
        <Gruppo
          titolo="Quando pubblichi la settimana"
          spiega="La pubblicazione è il momento in cui la squadra vede la settimana per la prima volta. Chi va oltre le sue ore da contratto riceve una domanda sola, sull'insieme."
        >
          <Interruttore
            acceso={v.conferma_settimana}
            onCambia={(x) => cambia({ conferma_settimana: x })}
            titolo="Settimana in straordinario da accettare"
            descrizione="A chi la settimana porta oltre le ore da contratto arriva una richiesta sulla settimana intera: la accetta o la rifiuta tutta, e in tutti e due i casi può scrivere. Accettando può chiedere un ritocco («il giovedì smetto alle 18»), che decidi tu: non sposta niente da solo. Rifiutando deve dire perché, e la settimana la rifai tu — i turni non cambiano da sé."
          />
        </Gruppo>

        <Gruppo
          titolo="Quando cambi un turno già pubblicato"
          spiega="Prima della pubblicazione il tabellone è un foglio di lavoro e correggerlo non chiede niente a nessuno. Dopo, dipende dal verso: se le ore aumentano si chiede, se calano si avvisa."
        >
          <Interruttore
            acceso={v.conferma_modifiche}
            onCambia={(x) => cambia({ conferma_modifiche: x })}
            titolo="Modifiche: chiedi se aggiungi, avvisa se togli"
            descrizione="Aggiungi ore e l'interessato può rifiutare: rifiutando, il turno torna com'era. Gliene togli, o gli sposti il turno a parità di ore, e allora non c'è niente da concedere — riceve un avviso che si chiude con «ho letto», e lo stesso vale per un turno che gli cancelli o che passi a un altro. Spento, non gli arriva niente."
          />
          <Interruttore
            acceso={v.conferma_modifiche_straordinari}
            onCambia={(x) => cambia({ conferma_modifiche_straordinari: x })}
            titolo="Modifiche che sfondano il contratto"
            descrizione="Come sopra, ma per le modifiche che portano oltre le ore da contratto: hanno il loro interruttore perché chiedono un'altra cosa. Chi accende solo questo lascia passare le modifiche normali senza disturbare nessuno."
          />
          <Interruttore
            acceso={v.conferma_cambio_reparto}
            onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
            titolo="Solo il reparto, stessi orari"
            descrizione="Spostare qualcuno dalla cassa alla sala senza togliergli un minuto. Spento — ed è il caso normale — non si segnala nemmeno: le ore sono quelle, e non è la modifica per cui si disturba una persona."
          />
        </Gruppo>

        <Gruppo
          titolo="Quando aggiungi un turno"
          spiega="Un turno che non c'era. Non ha un «prima» a cui tornare: se viene rifiutato salta, e resta un buco da coprire che l'app ti tiene in evidenza finché non lo riempi."
        >
          <Interruttore
            acceso={v.conferma_straordinari}
            onCambia={(x) => cambia({ conferma_straordinari: x })}
            titolo="Straordinari rifiutabili"
            descrizione="Un turno nuovo che porta la persona oltre le sue ore settimanali da contratto. Chi è a chiamata non ha un monte ore, quindi non lo riguarda."
          />
          <Interruttore
            acceso={v.orari_preimpostati}
            onCambia={(x) => cambia({ orari_preimpostati: x })}
            titolo="Orari preimpostati da contratto"
            descrizione="A chi ha un orario scritto sul contratto, un turno con un orario diverso diventa rifiutabile. L'orario si scrive sulla persona, in Squadra."
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
  spento,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  descrizione: string;
  /** La pagina che lo contiene è spenta: la regola resta scritta ma non
   *  vale, e si vede che non vale. */
  spento?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-3.5", spento && "opacity-45")}>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{titolo}</p>
        <p className="text-[12.5px] text-muted">{descrizione}</p>
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

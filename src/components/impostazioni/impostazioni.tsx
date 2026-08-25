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
          Valgono per tutta l&apos;azienda «{azienda}». Sono divise per pagina.
          Le pagine che non ti servono puoi spegnerle: spariscono dal menu di
          tutti.
        </p>
      </div>

      {/* ------------------------------------------------------- turni --- */}
      <Sezione
        icona={CalendarDays}
        pagina="Turni"
        nota="Quando i tuoi dipendenti ricevono un messaggio, e cosa possono fare."
      >
        <Nota>
          Il turno vale <strong className="font-medium text-text">subito</strong>,
          anche quando il dipendente lo può rifiutare: non devi aspettare la sua
          risposta per andare avanti. Se non risponde, vuol dire che gli va bene.
          Quasi sempre è così.
        </Nota>

        <Gruppo
          titolo="Quando pubblichi la settimana"
          spiega="Il momento in cui i dipendenti vedono la settimana."
        >
          <Regola>
            Se qualcuno ha{" "}
            <strong className="font-medium text-text">meno ore</strong> di quelle
            del suo contratto, l&apos;app te lo dice prima di pubblicare, con il
            nome e quante ore mancano. Puoi pubblicare lo stesso, ma te lo chiede
            prima. Mentre la settimana è in bozza non ti dice niente. Chi è a
            chiamata non ha ore da rispettare, e chi è assente conta solo per i
            giorni in cui c&apos;è.
          </Regola>
          <Interruttore
            acceso={v.conferma_settimana}
            onCambia={(x) => cambia({ conferma_settimana: x })}
            titolo="Chiedi conferma per le settimane con straordinario"
            descrizione="Il dipendente riceve una domanda sola su tutta la settimana, non una per ogni turno. Può accettarla o rifiutarla; accettando può anche chiederti un piccolo cambio."
            quando="pubblichi una settimana che porta qualcuno oltre le ore del suo contratto"
            esito="deve scriverti il motivo. I turni restano dove sono: la settimana la rifai tu"
          />
        </Gruppo>

        <Gruppo
          titolo="Quando cambi un turno già pubblicato"
          spiega="Finché la settimana è in bozza puoi cambiare tutto senza avvisare nessuno."
        >
          <Interruttore
            acceso={v.conferma_modifiche}
            onCambia={(x) => cambia({ conferma_modifiche: x })}
            titolo="Avvisa il dipendente quando cambi un suo turno"
            descrizione="Se il turno diventa più lungo, o cambia giorno o orario, il dipendente lo può rifiutare. Se invece diventa più corto, o glielo togli, riceve solo un avviso da leggere: non c'è niente da accettare."
            quando="allunghi, sposti, accorci o cancelli un turno di una settimana già pubblicata"
            esito="il turno torna come prima e tu ricevi un messaggio con il motivo"
          />
          <Interruttore
            acceso={v.conferma_cambio_reparto}
            onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
            titolo="Avvisa anche solo per il cambio di reparto"
            descrizione="Serve se sposti qualcuno da un reparto all'altro senza cambiargli gli orari. Di solito si lascia spento: le ore restano le stesse."
            quando="cambi solo il reparto, e nient'altro: stessa persona, stesso giorno, stessi orari"
            esito="il turno torna al reparto di prima"
          />
        </Gruppo>

        <Gruppo
          titolo="Quando aggiungi un turno"
          spiega="Un turno appena creato non ha una versione precedente a cui tornare."
        >
          <Interruttore
            acceso={v.conferma_straordinari}
            onCambia={(x) => cambia({ conferma_straordinari: x })}
            titolo="Straordinari da accettare"
            descrizione="Vale per chi ha un contratto a ore. Chi è a chiamata non ha ore da rispettare, quindi non lo riguarda."
            quando="il turno nuovo porta la persona oltre le ore settimanali del suo contratto"
            esito="il turno viene tolto e resta un buco da coprire. L'app te lo ricorda finché non lo riempi"
          />
          <Interruttore
            acceso={v.orari_preimpostati}
            onCambia={(x) => cambia({ orari_preimpostati: x })}
            titolo="Orari diversi dal solito"
            descrizione="Vale solo per chi ha un orario fisso scritto nella sua scheda, in Squadra. Chi non ce l'ha non è interessato."
            quando="gli dai un turno con orari diversi da quelli scritti nella sua scheda"
            esito="il turno viene tolto e resta un buco da coprire, come sopra"
          />
        </Gruppo>
      </Sezione>

      {/* ------------------------------------------------ supervisione --- */}
      <Sezione
        icona={Eye}
        pagina="Supervisione"
        nota="La giornata ora per ora: chi c'è, in quale reparto, e dove manca gente."
        accesa={v.pagina_supervisione}
        onCambiaPagina={(x) => cambia({ pagina_supervisione: x })}
      >
        <Interruttore
          acceso={v.supervisione_dipendenti}
          onCambia={(x) => cambia({ supervisione_dipendenti: x })}
          titolo="Visibile anche ai dipendenti"
          descrizione="Accesa, anche i dipendenti vedono com'è coperta la giornata. Spenta, la pagina resta solo a te."
          spento={!v.pagina_supervisione}
        />
      </Sezione>

      {/* ---------------------------------------------------- permessi --- */}
      <Sezione
        icona={Sun}
        pagina="Permessi"
        nota="Ferie, malattie e permessi: i dipendenti li chiedono, tu decidi."
        accesa={v.pagina_permessi}
        onCambiaPagina={(x) => cambia({ pagina_permessi: x })}
      >
        <div className={cn("space-y-3 py-3.5", !v.pagina_permessi && "opacity-45")}>
          <div>
            <p className="text-[14px] font-medium">Causali richiedibili</p>
            <p className="text-[12.5px] text-muted">
              Cosa un dipendente può chiedere da solo. Tocca una voce per
              toglierla o rimetterla. Tu puoi registrare qualsiasi assenza a
              mano, anche quelle spente qui.
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
        nota="Il riepilogo delle ore di ogni persona: lavorate, perse e per quale motivo. La vedi solo tu."
        accesa={v.pagina_prospetto}
        onCambiaPagina={(x) => cambia({ pagina_prospetto: x })}
      />

      <p className="px-1 text-[12.5px] text-muted">
        Turni, Squadra e Impostazioni non si possono spegnere: senza i turni
        l&apos;app non serve a niente, senza Squadra non puoi aggiungere
        nessuno, e da qui riaccendi tutto il resto.
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

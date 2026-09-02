"use client";

import {
  CalendarPlus,
  Eye,
  LayoutGrid,
  Send,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { salvaImpostazioni } from "@/app/(app)/impostazioni/actions";
import { CAUSALI, CODICI_CAUSALE } from "@/lib/assenze";
import type { Impostazioni as Valori } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

/** Le regole generali dell'azienda, raccolte per **ambito**.
 *
 *  Due cose cambiate il 2 settembre 2026, e sono la stessa cosa vista da due
 *  lati — la pagina era scritta come se esistesse solo il telefono:
 *
 *  - **Da 1024px le schede stanno su due colonne.** Il guscio dell'app da'
 *    fino a `max-w-[100rem]` e qui se ne usavano `max-w-2xl`: su un monitor
 *    erano 672px di nastro verticale e novecento pixel di niente, con il
 *    salvataggio automatico annunciato a tre schermate dalla leva toccata.
 *    Sotto i 1024px non cambia una riga: l'ordine e' lo stesso di prima.
 *  - **Le sei aggregazioni «per gesto» diventano quattro per ambito.** Il
 *    gesto non e' sparito, e' sceso di un livello: sta nella riga «Quando
 *    scatta». Sei intestazioni che cominciavano tutte per «Quando» erano un
 *    indice inutile su una colonna, e su due sarebbero state sei volte la
 *    stessa parola nella stessa schermata.
 *
 *  Insieme e' cambiato il registro dei testi. Fino al 30 agosto 2026 erano
 *  scritti «per chi gestisce un negozio», con la confidenza che ne segue
 *  («chi ti puo' dire di no», «l'app non serve a niente»). Adesso l'etichetta
 *  e' un sostantivo, la descrizione dice cosa cambia in azienda, e la
 *  rassicurazione e' un fatto — «il turno resta valido» — invece di una pacca
 *  sulla spalla. Chi legge qui e' un titolare o un responsabile turni, e sta
 *  decidendo, non imparando. */
export function Impostazioni({
  valori,
  azienda,
}: {
  valori: Valori;
  azienda: string;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<Valori>(valori);
  const [stato, setStato] = React.useState<
    "fermo" | "in_corso" | "salvato" | "errore"
  >("fermo");

  // L'ultima versione che il server ha accettato: se un salvataggio
  // fallisce, si torna qui invece di lasciare a schermo una leva che mente.
  const ultimoSalvato = React.useRef<Valori>(valori);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Salva da solo, mezzo secondo dopo l'ultimo tocco: chi spegne cinque
   *  motivi di fila fa un salvataggio, non cinque. */
  const cambia = (patch: Partial<Valori>) => {
    const prossimi = { ...v, ...patch };
    setV(prossimi);
    setStato("in_corso");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const esito = await salvaImpostazioni(prossimi);
      if (!esito.ok) {
        toast.error(esito.error);
        setV(ultimoSalvato.current);
        // Lo stato **resta** finche' non riesce un salvataggio nuovo: il
        // toast passa, e su due colonne la leva che e' tornata indietro puo'
        // stare fuori dall'occhio di chi guardava l'altra meta' dello
        // schermo. L'unico segnale sarebbe stato una levetta che si rimette
        // da sola in un punto che nessuno stava guardando.
        setStato("errore");
        return;
      }
      ultimoSalvato.current = prossimi;
      setStato("salvato");
      setTimeout(() => setStato("fermo"), 2000);
      // Il menu dipende da queste scelte: le pagine spente spariscono da li'.
      router.refresh();
    }, 500);
  };

  const commutaCausale = (codice: string) =>
    cambia({
      causali_richiedibili: v.causali_richiedibili.includes(codice)
        ? v.causali_richiedibili.filter((c) => c !== codice)
        : [...v.causali_richiedibili, codice],
    });

  return (
    <div className="mx-auto max-w-2xl space-y-4 lg:max-w-6xl lg:space-y-6">
      {/* L'intestazione resta a piena larghezza e da lg si appende sotto la
          topbar del guscio (`sticky top-0 z-30`, alta 56px): con due colonne
          lo stato del salvataggio finiva fuori campo appena si scendeva. */}
      <div className="flex items-baseline justify-between gap-3 lg:sticky lg:top-14 lg:z-20 lg:-mx-2 lg:bg-canvas lg:px-2 lg:py-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Impostazioni
          </h1>
          <p className="text-[13.5px] text-muted">
            Configurazione di «{azienda}». Ogni modifica si applica subito a
            tutta l&apos;azienda e viene salvata automaticamente.
          </p>
        </div>
        {/* Il salvataggio e' silenzioso, ma non muto: senza questa scritta
            l'unica conferma sarebbe la leva stessa, che era gia' li'. */}
        <p
          aria-live="polite"
          className={cn(
            "shrink-0 text-[12.5px]",
            stato === "errore" ? "font-medium text-danger" : "text-faint",
          )}
        >
          {stato === "in_corso"
            ? "Salvataggio…"
            : stato === "salvato"
              ? "Salvato"
              : stato === "errore"
                ? "Modifica non salvata"
                : ""}
        </p>
      </div>

      {/* Il modello di tutta la pagina, e la sua unica eccezione. Vengono
          prima di tutto: senza, ogni levetta qui sotto sembra decidere se il
          turno vale, e non e' quello che fanno. Affiancati da lg. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">
          I turni che pianifichi sono validi dal momento in cui li salvi. Le
          regole di questa pagina stabiliscono solo chi può rifiutare un turno,
          e in quali casi: senza risposta, il turno resta valido.
        </p>

        <details className="group rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
          <summary className="tap flex cursor-pointer list-none items-start gap-2">
            <Freccia />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">
                Quando un rifiuto ha effetto
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">
                Il turno non cambia al momento del rifiuto: cambia quando apri
                i messaggi.
              </span>
            </span>
          </summary>
          <p className="mt-2 pl-5 text-[13px] leading-relaxed text-muted">
            Il rifiuto resta in attesa nella casella dei messaggi, in cima ai
            Turni: il turno si aggiorna nel momento in cui{" "}
            <strong className="font-medium text-text">apri i messaggi</strong>,
            così lo vedi mentre succede. Se nel frattempo quel turno
            l&apos;avevi già modificato tu, il rifiuto non produce effetti:
            l&apos;ultima modifica registrata è la tua.
          </p>
        </details>
      </div>

      {/* Due wrapper di colonna, non otto figli diretti dentro `grid-cols-2`:
          cosi' l'ordine del DOM resta 1-2-3-4 (che e' l'ordine di lettura sul
          telefono), il Tab scorre per colonne come si legge un layout a
          colonne, e aprire un `<details>` allunga solo la sua colonna.
          `items-start` o le due si stirano alla stessa altezza e il
          richiudibile aperto lascia un vuoto grigio nell'altra. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
        {/* --------------------------------- cosa esiste, e chi lo vede --- */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <Sezione
            icona={LayoutGrid}
            titolo="Moduli attivi"
            nota="Quattro moduli opzionali. Disattivandoli spariscono dal menu; i dati già registrati restano."
            piede="Turni, Squadra e Impostazioni sono moduli di base e non si disattivano."
          >
            <Modulo
              nome="Permessi"
              breve="I dipendenti richiedono ferie e permessi dall'app. Se disattivato, le assenze le registri tu dai Turni."
              acceso={v.pagina_permessi}
              onCambia={(x) => cambia({ pagina_permessi: x })}
            />
            <Modulo
              nome="Supervisione"
              breve="Copertura della giornata in tempo reale, ora per ora e reparto per reparto."
              acceso={v.pagina_supervisione}
              onCambia={(x) => cambia({ pagina_supervisione: x })}
            />
            <Modulo
              nome="Prospetto"
              breve="Riepilogo mensile delle ore lavorate. Riservato al responsabile."
              acceso={v.pagina_prospetto}
              onCambia={(x) => cambia({ pagina_prospetto: x })}
            />
            <Modulo
              nome="Disponibilità"
              breve="Il personale a chiamata dichiara i propri giorni dall'app. Se disattivato, le dichiarazioni le registri tu dal tabellone."
              acceso={v.pagina_disponibilita}
              onCambia={(x) => cambia({ pagina_disponibilita: x })}
            />
          </Sezione>

          <Sezione
            icona={Eye}
            titolo="Visibilità e richieste del personale"
            nota="Cosa i dipendenti vedono dell'organizzazione e cosa possono richiedere da soli."
          >
            <Interruttore
              acceso={v.supervisione_dipendenti}
              onCambia={(x) => cambia({ supervisione_dipendenti: x })}
              titolo="Supervisione visibile ai dipendenti"
              breve="I dipendenti vedono la copertura della giornata e i colleghi in turno. I motivi delle assenze restano riservati."
              quando="Un dipendente apre l'app: la voce Supervisione compare nel suo menu."
              etichettaEsito="Cosa vede"
              esito="I turni della giornata, reparto per reparto. Il motivo di un'assenza resta fra te e l'interessato."
              spento={!v.pagina_supervisione}
            />
            <Avanzate
              riepilogo={`Motivi di assenza richiedibili dall'app: ${v.causali_richiedibili.length} di ${CODICI_CAUSALE.length} abilitati.`}
              disabilitato={!v.pagina_permessi}
            >
              <div className="space-y-3 py-3.5">
                <p className="text-[13px] text-muted">
                  Le tipologie di assenza che un dipendente può richiedere da
                  solo. Tocca un motivo per abilitarlo o disabilitarlo; gli altri li
                  registri tu, senza limitazioni.
                </p>
                {CAUSALI.map((gruppo) => (
                  <div key={gruppo.gruppo}>
                    <p className="mb-1.5 text-[12px] uppercase tracking-wide text-faint">
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
            </Avanzate>
          </Sezione>
        </div>

        {/* ------------------------- cosa succede quando muovi un turno --- */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <Sezione
            icona={Send}
            titolo="Pubblicazione e modifiche"
            nota="Cosa succede quando rendi visibile una settimana o cambi un turno già pubblicato."
          >
            <Regola
              titolo="Controllo delle ore da contratto"
              breve="Prima di pubblicare, l'app segnala chi resta sotto le ore previste dal contratto, con i nomi."
              dettagli="È una segnalazione, non un blocco: puoi pubblicare comunque. Non compare finché la settimana è visibile solo a te. Il personale a chiamata è escluso, e chi è assente conta solo per i giorni di presenza."
            />
            <Interruttore
              acceso={v.conferma_settimana}
              onCambia={(x) => cambia({ conferma_settimana: x })}
              titolo="Accettazione dello straordinario"
              breve="Alla pubblicazione, chi supera le ore da contratto riceve una richiesta unica sull'intera settimana."
              quando="Pubblichi una settimana che porta una o più persone oltre le ore del proprio contratto."
              esito="L'interessato indica il motivo e lo trovi nei messaggi. I turni restano invariati: la settimana la ripianifichi tu."
            />
            <Interruttore
              acceso={v.conferma_modifiche}
              onCambia={(x) => cambia({ conferma_modifiche: x })}
              titolo="Notifica delle modifiche"
              breve="Le modifiche a una settimana pubblicata arrivano all'interessato: allungamenti e spostamenti sono rifiutabili, riduzioni e cancellazioni solo notificate."
              quando="Allunghi, sposti, accorci o cancelli un turno in una settimana già pubblicata."
              esito="All'apertura dei messaggi il turno torna esattamente come prima della modifica, con il motivo indicato."
            />
            <Avanzate
              riepilogo={
                v.conferma_cambio_reparto
                  ? "I cambi di solo reparto sono rifiutabili."
                  : "I cambi di solo reparto non generano notifiche."
              }
            >
              <Interruttore
                acceso={v.conferma_cambio_reparto}
                onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
                titolo="Includi i cambi di reparto"
                breve="Estende la notifica ai turni in cui cambia solo il reparto, a parità di giorno e orario."
                quando="Cambi il reparto di un turno, e nient'altro."
                esito="All'apertura dei messaggi il turno torna al reparto precedente."
              />
            </Avanzate>
          </Sezione>

          <Sezione
            icona={CalendarPlus}
            titolo="Nuovi turni e personale a chiamata"
            nota="Le regole che si applicano nel momento in cui assegni un turno."
          >
            <Interruttore
              acceso={v.conferma_straordinari}
              onCambia={(x) => cambia({ conferma_straordinari: x })}
              titolo="Accettazione dei turni in straordinario"
              breve="Un turno che porta la persona oltre le ore settimanali da contratto deve essere accettato."
              quando="Assegni un turno che porta la persona oltre le ore settimanali del suo contratto."
              esito="All'apertura dei messaggi il turno viene eliminato e il giorno torna libero: non resta nessun turno scoperto da riassegnare. Il promemoria resta nei messaggi finché non ripianifichi quelle ore o non lo chiudi."
            />
            <Avanzate
              riepilogo={
                v.orari_preimpostati
                  ? "Gli orari fuori standard sono rifiutabili."
                  : "Gli orari fuori standard valgono come qualsiasi altro turno."
              }
            >
              <Interruttore
                acceso={v.orari_preimpostati}
                onCambia={(x) => cambia({ orari_preimpostati: x })}
                titolo="Orari fuori standard"
                breve="Per chi ha un orario fisso in scheda, un turno con orari diversi diventa rifiutabile."
                quando="Assegni orari diversi da quelli indicati nella scheda della persona, in Squadra."
                esito="Il turno viene eliminato e il giorno torna libero."
              />
            </Avanzate>

            {/* Non e' una levetta e non e' un'avanzata: e' la terza cosa che
                si decide qui dentro, e ha bisogno del suo titolo. */}
            <div className="py-3.5">
              <p className="text-[14px] font-medium">
                Regime di ingaggio del personale a chiamata
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                Si applica a chi ha il contratto «a chiamata» nella scheda, in
                Squadra. Sono tre accordi diversi, non tre gradi della stessa
                regola.
              </p>
              <Scelta
                valore={v.regime_chiamata}
                onCambia={(x) => cambia({ regime_chiamata: x })}
                opzioni={[
                  {
                    valore: "indisponibilita",
                    titolo: "Indisponibilità dichiarata",
                    breve:
                      "La persona segnala i giorni in cui non è disponibile. Negli altri giorni l'assegnazione è diretta.",
                    quando:
                      "Assegni un turno in un giorno dichiarato indisponibile.",
                    esito:
                      "Il salvataggio viene bloccato e l'app indica le ore escluse.",
                  },
                  {
                    valore: "disponibilita",
                    titolo: "Disponibilità dichiarata",
                    breve:
                      "La persona segnala i giorni in cui è disponibile. Fuori da quelle fasce non è assegnabile: finché non dichiara nulla, non riceve turni.",
                    quando:
                      "Assegni un turno fuori dai giorni o dagli orari dichiarati.",
                    esito:
                      "Il salvataggio viene bloccato: riduci il turno o chiedi di estendere la disponibilità.",
                  },
                  {
                    valore: "on_demand",
                    titolo: "Proposta singola",
                    breve:
                      "Nessun calendario: ogni turno è una proposta e diventa valido solo con l'accettazione.",
                    quando:
                      "Assegni o modifichi un turno in una settimana già pubblicata.",
                    esito:
                      "All'apertura dei messaggi un turno appena creato viene eliminato e il giorno torna libero; un turno modificato torna alla versione precedente.",
                  },
                ]}
              />
              {v.regime_chiamata === "on_demand" ? (
                <p className="text-[13px] leading-relaxed text-warning">
                  Con questa scelta il turno{" "}
                  <strong className="font-medium">
                    non è valido finché la persona non accetta
                  </strong>
                  : è l&apos;unico caso in tutta l&apos;app in cui il silenzio
                  non equivale all&apos;assenso.
                </p>
              ) : v.pagina_disponibilita ? (
                <p className="text-[13px] leading-relaxed text-muted">
                  Le dichiarazioni arrivano dal modulo Disponibilità; se una
                  persona ti telefona, puoi registrarle tu al posto suo.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  Modulo Disponibilità disattivato: le dichiarazioni le
                  registri tu dal tabellone, dalla vista «Disponibilità». Il
                  regime scelto resta valido.
                </p>
              )}
            </div>
          </Sezione>
        </div>
      </div>
    </div>
  );
}

/** «Disattivato», scritto uguale ovunque.
 *
 *  E' il modo in cui questa schermata dice che una cosa c'e' ma non vale.
 *  L'altro modo — sbiadire il blocco — e' stato tolto il 30 agosto 2026:
 *  portava il testo sotto il minimo leggibile, e a farne le spese era
 *  proprio la riga che spiega cosa fa la levetta. */
function NonInUso() {
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-faint">
      disattivato
    </span>
  );
}

/** La freccetta dei richiudibili, una sola per tutti. */
function Freccia() {
  return (
    <span
      aria-hidden
      className="mt-0.5 shrink-0 text-[13px] text-faint transition-transform group-open:rotate-90"
    >
      ›
    </span>
  );
}

/** Un ambito delle impostazioni. Il titolo e' un `<h2>` vero e la scheda lo
 *  dichiara con `aria-labelledby`: con due colonne affiancate e' l'unico modo
 *  perche' chi legge con lo screen reader sappia dove finisce una scheda e
 *  ne cominci un'altra. */
function Sezione({
  icona: Icona,
  titolo,
  nota,
  piede,
  children,
}: {
  icona: LucideIcon;
  titolo: string;
  nota?: string;
  piede?: string;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <header className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icona className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-[14px] font-semibold">
            {titolo}
          </h2>
          {nota ? <p className="text-[12.5px] text-muted">{nota}</p> : null}
        </div>
      </header>
      {children ? (
        <div className="divide-y divide-border px-4">{children}</div>
      ) : null}
      {piede ? (
        <p className="border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-faint">
          {piede}
        </p>
      ) : null}
    </section>
  );
}

/** Un modulo che si puo' spegnere: nome, una riga, la levetta. */
function Modulo({
  nome,
  breve,
  acceso,
  onCambia,
}: {
  nome: string;
  breve: string;
  acceso: boolean;
  onCambia: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {nome}
          {!acceso ? <NonInUso /> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">{breve}</p>
      </div>
      <Levetta acceso={acceso} onCambia={onCambia} etichetta={`Modulo ${nome}`} />
    </div>
  );
}

/** Quello che un negozio non tocca mai: chiuso, ma non nascosto.
 *
 *  La riga di riepilogo e' la condizione perche' il richiudibile non sia una
 *  trappola: dice lo stato vero senza aprire. E' un `<details>` nativo. */
function Avanzate({
  riepilogo,
  disabilitato,
  children,
}: {
  riepilogo: string;
  disabilitato?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group py-3.5">
      <summary
        className={cn(
          "tap flex list-none items-start gap-2 rounded-xl px-1 py-1",
          disabilitato ? "pointer-events-none" : "cursor-pointer",
        )}
      >
        <Freccia />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            Opzioni avanzate
            {disabilitato ? <NonInUso /> : null}
          </span>
          <span className="mt-0.5 block text-[13px] text-muted">{riepilogo}</span>
        </span>
      </summary>
      <div className="mt-1 divide-y divide-border">{children}</div>
    </details>
  );
}

/** Il dettaglio di una regola: si apre da chi sta decidendo, non pesa su chi
 *  scorre. Dentro ci stanno le due domande di sempre — quando scatta, cosa
 *  succede al no. */
function ComeFunziona({
  quando,
  esito,
  etichettaEsito = "In caso di rifiuto",
}: {
  quando?: string;
  esito?: string;
  etichettaEsito?: string;
}) {
  if (!quando && !esito) return null;
  return (
    <details className="group mt-1">
      <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-faint hover:text-muted">
        <Freccia />
        Come funziona
      </summary>
      <dl className="mt-1 space-y-0.5 pl-5 text-[13px]">
        {quando ? (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-faint">Quando scatta</dt>
            <dd className="min-w-0 text-muted">{quando}</dd>
          </div>
        ) : null}
        {esito ? (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-faint">{etichettaEsito}</dt>
            <dd className="min-w-0 text-muted">{esito}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function Interruttore({
  acceso,
  onCambia,
  titolo,
  breve,
  quando,
  esito,
  etichettaEsito,
  spento,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  /** La riga che si vede sempre: una, e basta. Il resto in «Come funziona». */
  breve: string;
  quando?: string;
  esito?: string;
  etichettaEsito?: string;
  /** Il modulo che lo contiene e' spento: la regola resta scritta ma non
   *  vale, e si vede che non vale — a parole, mai sbiadendo. */
  spento?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {titolo}
          {spento ? <NonInUso /> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">{breve}</p>
        <ComeFunziona quando={quando} esito={esito} etichettaEsito={etichettaEsito} />
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

/** Una scelta fra tre, dove una levetta non basta: tre accordi diversi, non
 *  tre gradi della stessa cosa. Le due righe «Quando scatta / Esito» le porta
 *  solo l'opzione scelta: sono la conseguenza della scelta fatta, e su tutte
 *  e tre insieme erano la meta' del peso della pagina.
 *
 *  «Esito» e non «In caso di rifiuto»: due regimi su tre **bloccano il
 *  salvataggio**, e li' un rifiuto e' una cosa che non succede. */
function Scelta<T extends string>({
  valore,
  onCambia,
  opzioni,
}: {
  valore: T;
  onCambia: (v: T) => void;
  opzioni: {
    valore: T;
    titolo: string;
    breve: string;
    quando: string;
    esito: string;
  }[];
}) {
  return (
    <div role="radiogroup" className="space-y-2 py-3.5">
      {opzioni.map((o) => {
        const scelta = o.valore === valore;
        return (
          <button
            key={o.valore}
            type="button"
            role="radio"
            aria-checked={scelta}
            onClick={() => onCambia(o.valore)}
            className={cn(
              "tap flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
              scelta
                ? "border-accent bg-accent-soft"
                : "border-border bg-surface-2 hover:border-border-strong",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
                scelta ? "border-accent" : "border-border-strong",
              )}
            >
              {scelta ? <span className="size-2 rounded-full bg-accent" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[14px] font-medium",
                  scelta && "text-accent",
                )}
              >
                {o.titolo}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">
                {o.breve}
              </span>
              {scelta ? (
                <span className="mt-1.5 block space-y-0.5 text-[13px]">
                  <span className="flex gap-1.5">
                    <span className="shrink-0 text-faint">Quando scatta</span>
                    <span className="min-w-0 text-muted">{o.quando}</span>
                  </span>
                  <span className="flex gap-1.5">
                    <span className="shrink-0 text-faint">Esito</span>
                    <span className="min-w-0 text-muted">{o.esito}</span>
                  </span>
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
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

/** Una regola che **non** è un interruttore: vale sempre, non si spegne.
 *  Sta qui in mezzo alle levette perché è lì che uno la cerca. */
function Regola({
  titolo,
  breve,
  dettagli,
}: {
  titolo: string;
  breve: string;
  dettagli?: string;
}) {
  return (
    <div className="py-3.5">
      <div className="rounded-xl bg-surface-2 px-3.5 py-3">
        <p className="text-[12px] font-medium uppercase tracking-wide text-success">
          Sempre attivo
        </p>
        <p className="mt-1 text-[14px] font-medium">{titolo}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{breve}</p>
        {dettagli ? (
          <details className="group mt-1">
            <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-faint hover:text-muted">
              <Freccia />
              Come funziona
            </summary>
            <p className="mt-1 pl-5 text-[13px] leading-relaxed text-muted">
              {dettagli}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

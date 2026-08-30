"use client";

import {
  Eye,
  PencilLine,
  PhoneCall,
  Plus,
  Send,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { salvaImpostazioni } from "@/app/(app)/impostazioni/actions";
import { CAUSALI, CODICI_CAUSALE } from "@/lib/assenze";
import type { Impostazioni as Valori } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

/** Le regole generali dell'azienda, raccolte per **gesto**.
 *
 *  Due misure prese il 30 agosto 2026, dopo che la prima versione per gesti
 *  era diventata un documento da ~2.700 parole per dieci controlli:
 *
 *  - **A vista resta una riga per controllo.** Il resto — quando scatta, cosa
 *    succede al no — sta dietro «Come funziona», dove lo legge chi sta
 *    decidendo. Le spiegazioni non sono sparite: hanno smesso di stare tutte
 *    davanti.
 *  - **Ogni modifica si salva da sola**, come ogni altra azione dell'app. Il
 *    bottone «Salva» in fondo chiedeva di ricordarsi di lui a tre schermate
 *    di distanza dalla leva toccata.
 *
 *  Le tre pagine spegnibili stanno in una scheda propria, in testa:
 *  accendere o spegnere una pagina e' una decisione d'altra natura rispetto
 *  a una regola di conferma, e dentro le intestazioni dei gesti non la
 *  trovava nessuno. */
export function Impostazioni({
  valori,
  azienda,
}: {
  valori: Valori;
  azienda: string;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<Valori>(valori);
  const [stato, setStato] = React.useState<"fermo" | "in_corso" | "salvato">(
    "fermo",
  );

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
        setStato("fermo");
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">
            Impostazioni
          </h1>
          <p className="text-[13.5px] text-muted">
            Valgono per tutta «{azienda}». Ogni modifica si salva da sola.
          </p>
        </div>
        {/* Il salvataggio e' silenzioso, ma non muto: senza questa scritta
            l'unica conferma sarebbe la leva stessa, che era gia' li'. */}
        <p aria-live="polite" className="shrink-0 text-[12.5px] text-faint">
          {stato === "in_corso"
            ? "Salvataggio…"
            : stato === "salvato"
              ? "Salvato"
              : ""}
        </p>
      </div>

      {/* Viene prima di tutto: senza, ogni levetta qui sotto sembra decidere
          se il turno vale, e non e' quello che fanno. */}
      <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">
        In quest&apos;app il turno vale appena lo scrivi. Queste regole
        decidono solo chi ti può dire di no, e su cosa: se non risponde
        nessuno, va bene.
      </p>

      <details className="group rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
        <summary className="tap flex cursor-pointer list-none items-start gap-2">
          <Freccia />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">
              Come arriva un no
            </span>
            <span className="mt-0.5 block text-[13px] text-muted">
              L&apos;effetto parte quando apri i messaggi, e l&apos;ultima
              parola è la tua.
            </span>
          </span>
        </summary>
        <p className="mt-2 pl-5 text-[13px] leading-relaxed text-muted">
          Il turno non cambia nel momento in cui la persona rifiuta: cambia
          quando{" "}
          <strong className="font-medium text-text">apri i messaggi</strong> in
          cima ai Turni, così lo vedi mentre succede. Se nel frattempo quel
          turno l&apos;avevi già cambiato tu, il rifiuto non tocca niente:
          vale l&apos;ultima parola tua.
        </p>
      </details>

      {/* ------------------------------------------- le pagine dell'app --- */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <header className="border-b border-border bg-surface-2 px-4 py-3">
          <p className="text-[14px] font-semibold">Le pagine dell&apos;app</p>
          <p className="text-[12.5px] text-muted">
            Tre si possono spegnere: spariscono dal menu, quello che
            contengono resta registrato.
          </p>
        </header>
        <div className="divide-y divide-border px-4">
          <Pagina
            nome="Permessi"
            breve="Ferie e permessi chiesti dall'app. Spenta, le assenze le registri tu, dai Turni."
            acceso={v.pagina_permessi}
            onCambia={(x) => cambia({ pagina_permessi: x })}
          />
          <Pagina
            nome="Supervisione"
            breve="La giornata ora per ora, reparto per reparto."
            acceso={v.pagina_supervisione}
            onCambia={(x) => cambia({ pagina_supervisione: x })}
          />
          <Pagina
            nome="Prospetto"
            breve="Il conto delle ore a fine mese. La vedi solo tu."
            acceso={v.pagina_prospetto}
            onCambia={(x) => cambia({ pagina_prospetto: x })}
          />
          <Pagina
            nome="Disponibilità"
            breve="Il calendario di chi è a chiamata, dal suo telefono. Spenta, le disponibilità le segni tu dal tabellone."
            acceso={v.pagina_disponibilita}
            onCambia={(x) => cambia({ pagina_disponibilita: x })}
          />
        </div>
        <p className="border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-faint">
          Turni, Squadra e Impostazioni non si spengono: senza, l&apos;app non
          serve a niente.
        </p>
      </section>

      {/* --------------------------------- 1 · pubblichi la settimana --- */}
      <Gesto icona={Send} titolo="Quando pubblichi la settimana">
        <Regola
          breve="Se qualcuno resta sotto le ore del contratto, l'app te lo dice prima, coi nomi."
          dettagli="Puoi pubblicare lo stesso, ma te lo chiede prima. Finché la settimana la vedi solo tu non ti dice niente. Chi è a chiamata non ha ore da rispettare, e chi è assente conta solo per i giorni in cui c'è."
        />
        <Interruttore
          acceso={v.conferma_settimana}
          onCambia={(x) => cambia({ conferma_settimana: x })}
          titolo="Straordinario da accettare"
          breve="Una settimana che porta qualcuno oltre le sue ore va accettata: una domanda sola, su tutta la settimana."
          quando="pubblichi una settimana che porta qualcuno oltre le ore del suo contratto"
          esito="deve scriverti il motivo, e tu lo leggi nei messaggi. I turni non si muovono di un minuto: la settimana la rifai tu, come vuoi"
        />
      </Gesto>

      {/* ------------------------ 2 · cambi un turno gia' pubblicato --- */}
      <Gesto icona={PencilLine} titolo="Quando cambi un turno già pubblicato">
        <Interruttore
          acceso={v.conferma_modifiche}
          onCambia={(x) => cambia({ conferma_modifiche: x })}
          titolo="Avvisa chi subisce il cambio"
          breve="Un turno allungato o spostato si può rifiutare; uno accorciato o tolto è solo un avviso da leggere."
          quando="allunghi, sposti, accorci o cancelli un turno di una settimana già pubblicata"
          esito="aprendo i messaggi il turno torna esattamente com'era prima della tua modifica, con scritto il motivo"
        />
        <Avanzate
          riepilogo={
            v.conferma_cambio_reparto
              ? "Acceso: anche il solo cambio di reparto si può rifiutare."
              : "Spento: il solo cambio di reparto non chiede niente a nessuno."
          }
        >
          <Interruttore
            acceso={v.conferma_cambio_reparto}
            onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
            titolo="Chiedi anche per il solo reparto"
            breve="Stessa persona, stesso giorno, stessi orari: cambia solo il reparto."
            quando="cambi solo il reparto, e nient'altro"
            esito="aprendo i messaggi il turno torna al reparto di prima"
          />
        </Avanzate>
      </Gesto>

      {/* ------------------------------------ 3 · aggiungi un turno --- */}
      <Gesto icona={Plus} titolo="Quando aggiungi un turno">
        <Interruttore
          acceso={v.conferma_straordinari}
          onCambia={(x) => cambia({ conferma_straordinari: x })}
          titolo="Straordinari da accettare"
          breve="Il turno che porta la persona oltre le sue ore settimanali va accettato da lei."
          quando="il turno nuovo porta la persona oltre le ore settimanali del suo contratto"
          esito="aprendo i messaggi il turno viene cancellato: sul tabellone quel giorno torna vuoto e non resta nessun turno scoperto da riassegnare. Il promemoria te lo tiene la casella dei messaggi, finché non rifai quelle ore o non la chiudi"
        />
        <Avanzate
          riepilogo={
            v.orari_preimpostati
              ? "Acceso: un turno con orari diversi da quelli in scheda si può rifiutare."
              : "Spento: un turno con orari diversi da quelli in scheda vale come tutti gli altri."
          }
        >
          <Interruttore
            acceso={v.orari_preimpostati}
            onCambia={(x) => cambia({ orari_preimpostati: x })}
            titolo="Orari diversi dal solito"
            breve="Vale solo per chi ha un orario fisso scritto in scheda, in Squadra."
            quando="gli dai un turno con orari diversi da quelli scritti nella sua scheda"
            esito="aprendo i messaggi il turno viene cancellato e quel giorno torna vuoto, come sopra"
          />
        </Avanzate>
      </Gesto>

      {/* ---------------------------- 4 · un turno a chi e' a chiamata --- */}
      <Gesto
        icona={PhoneCall}
        titolo="Quando dai un turno a chi lavora a chiamata"
        nota="Vale solo per chi ha «a chiamata» nella sua scheda, in Squadra."
      >
        <Scelta
          valore={v.regime_chiamata}
          onCambia={(x) => cambia({ regime_chiamata: x })}
          opzioni={[
            {
              valore: "indisponibilita",
              titolo: "Segnala quando non può",
              breve:
                "Segna i giorni in cui non c'è: in tutti gli altri lo metti in turno senza chiedere.",
              quando: "provi a dargli un turno in un giorno che ha segnato",
              esito:
                "l'app non ti lascia salvare, e ti dice quali ore aveva escluso",
            },
            {
              valore: "disponibilita",
              titolo: "Segnala quando può",
              breve:
                "Turni solo nei giorni che ha segnato. Finché non segna niente, niente turni: il vincolo è tuo.",
              quando:
                "provi a dargli un turno fuori dai giorni e dalle ore che ha segnato",
              esito:
                "l'app non ti lascia salvare: o stringi il turno, o gli chiedi di allargare la disponibilità",
            },
            {
              valore: "on_demand",
              titolo: "Chiedi ogni volta",
              breve:
                "Nessun calendario: ogni turno è una proposta, e vale solo se accetta.",
              quando: "gli dai o gli cambi un turno di una settimana già pubblicata",
              esito:
                "aprendo i messaggi, un turno appena creato viene cancellato — quel giorno torna vuoto — mentre un turno che avevi solo cambiato torna com'era. Quella chiamata la rifai a qualcun altro",
            },
          ]}
        />
        {v.regime_chiamata === "on_demand" ? (
          <p className="pb-3.5 text-[13px] leading-relaxed text-warning">
            Attenzione: con questa scelta il turno di chi è a chiamata{" "}
            <strong className="font-medium">vale solo se lui accetta</strong>.
            È l&apos;unico caso in tutta l&apos;app in cui il silenzio non
            vuol dire sì.
          </p>
        ) : v.pagina_disponibilita ? (
          <p className="pb-3.5 text-[13px] leading-relaxed text-muted">
            Il calendario si riempie da «Disponibilità», nel menu dei
            dipendenti a chiamata; se uno ti telefona, puoi segnarlo tu al
            posto suo.
          </p>
        ) : (
          <p className="pb-3.5 text-[13px] leading-relaxed text-muted">
            La pagina Disponibilità è spenta: le dichiarazioni le segni tu
            dal tabellone, dalla vista «Disponibilità». La regola scelta qui
            vale lo stesso.
          </p>
        )}
      </Gesto>

      {/* --------------------------------- 5 · qualcuno chiede ferie --- */}
      <Gesto
        icona={Sun}
        titolo="Quando qualcuno chiede ferie"
        nota="Succede nella pagina Permessi: i dipendenti chiedono, tu decidi."
        accesa={v.pagina_permessi}
      >
        <Avanzate
          riepilogo={`${v.causali_richiedibili.length} motivi su ${CODICI_CAUSALE.length} si possono chiedere dall'app. Gli altri li registri solo tu.`}
          disabilitato={!v.pagina_permessi}
        >
          <div className="space-y-3 py-3.5">
            <p className="text-[13px] text-muted">
              Cosa un dipendente può chiedere da solo. Tocca una voce per
              toglierla o rimetterla; tu puoi registrare a mano anche quelle
              spente.
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
      </Gesto>

      {/* ------------------------------ 6 · sapere chi c'e' adesso --- */}
      <Gesto
        icona={Eye}
        titolo="Quando vuoi sapere chi c'è adesso"
        nota="Succede nella pagina Supervisione."
        accesa={v.pagina_supervisione}
      >
        <Interruttore
          acceso={v.supervisione_dipendenti}
          onCambia={(x) => cambia({ supervisione_dipendenti: x })}
          titolo="Visibile anche ai dipendenti"
          breve="Anche i dipendenti vedono la copertura della giornata; il motivo di un'assenza no."
          quando="un dipendente apre l'app: la voce Supervisione gli compare, oppure no"
          etichettaEsito="Cosa vede"
          esito="i turni di tutti nella giornata, reparto per reparto. Il motivo di un'assenza resta fra te e l'interessato"
          spento={!v.pagina_supervisione}
        />
      </Gesto>
    </div>
  );
}

/** «Non in uso», scritto uguale ovunque.
 *
 *  E' il modo in cui questa schermata dice che una cosa c'e' ma non vale.
 *  L'altro modo — sbiadire il blocco — e' stato tolto il 30 agosto 2026:
 *  portava il testo sotto il minimo leggibile, e a farne le spese era
 *  proprio la riga che spiega cosa fa la levetta. */
function NonInUso() {
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-faint">
      non in uso
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

/** Un gesto: il momento in cui quelle regole scattano. Se `accesa` e' falso
 *  la pagina che lo ospita e' spenta: lo dice la pastiglia, non un velo. */
function Gesto({
  icona: Icona,
  titolo,
  nota,
  accesa = true,
  children,
}: {
  icona: LucideIcon;
  titolo: string;
  nota?: string;
  accesa?: boolean;
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
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            {titolo}
            {!accesa ? <NonInUso /> : null}
          </p>
          {nota ? <p className="text-[12.5px] text-muted">{nota}</p> : null}
        </div>
      </header>
      {children ? (
        <div className="divide-y divide-border px-4">{children}</div>
      ) : null}
    </section>
  );
}

/** Una pagina che si puo' spegnere: nome, una riga, la levetta. */
function Pagina({
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
      <Levetta acceso={acceso} onCambia={onCambia} etichetta={`Usa la pagina ${nome}`} />
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
            Impostazioni avanzate
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
  etichettaEsito = "Se dice no",
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
            <dt className="shrink-0 text-faint">Quando</dt>
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
  /** La pagina che lo contiene e' spenta: la regola resta scritta ma non
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
 *  tre gradi della stessa cosa. Le due righe «Quando / Se dice no» le porta
 *  solo l'opzione scelta: sono la conseguenza della scelta fatta, e su tutte
 *  e tre insieme erano la meta' del peso della pagina. */
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
                    <span className="shrink-0 text-faint">Quando</span>
                    <span className="min-w-0 text-muted">{o.quando}</span>
                  </span>
                  <span className="flex gap-1.5">
                    <span className="shrink-0 text-faint">Se dice no</span>
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
function Regola({ breve, dettagli }: { breve: string; dettagli?: string }) {
  return (
    <div className="py-3.5">
      <div className="rounded-xl bg-surface-2 px-3.5 py-3">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
          Sempre attiva
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{breve}</p>
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

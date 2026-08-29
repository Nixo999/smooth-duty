"use client";

import {
  ClipboardList,
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
import { Button } from "@/components/ui/button";
import { CAUSALI, CODICI_CAUSALE } from "@/lib/assenze";
import type { Impostazioni as Valori } from "@/lib/impostazioni";
import { cn } from "@/lib/utils";

/** Le regole generali dell'azienda, raccolte per **gesto**.
 *
 *  Fino al 30 agosto 2026 erano raccolte per pagina — quattro sezioni, e le
 *  quattro sezioni erano le quattro pagine dell'app. Nessuno pero' cerca
 *  «l'impostazione della pagina Permessi»: cerca «cosa succede quando uno mi
 *  chiede le ferie». I gruppi sono sette e ognuno e' un momento della
 *  settimana di chi fa i turni; le impostazioni sono le stesse di prima,
 *  ridistribuite.
 *
 *  Tre gesti si appoggiano a una pagina che si puo' spegnere del tutto:
 *  l'interruttore sta nell'intestazione, e quello che contengono resta li'
 *  ma smette di contare. */
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
      toast.success("Impostazioni salvate. Valgono da adesso, per tutta la squadra.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-[13.5px] text-muted">
          Valgono per tutta l&apos;azienda «{azienda}». Sono divise per gesto:
          cerca il momento in cui la regola ti serve, non la pagina dove la
          vedi applicata.
        </p>
      </div>

      {/* Viene prima di tutto: senza, ogni levetta qui sotto sembra decidere
          se il turno vale, e non e' quello che fanno. */}
      <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13.5px] leading-relaxed text-muted">
        In quest&apos;app il turno vale appena lo scrivi. Le impostazioni qui
        sotto non cambiano questo: decidono solo chi ti può dire di no, e su
        cosa. Se non risponde nessuno, vuol dire che va bene.
      </p>

      {/* Come arriva un no, detto una volta sola. Le quattro levette che lo
          rendono possibile ripeterebbero altrimenti le stesse tre righe
          ognuna — ed e' la parte che sul tabellone si vede davvero. */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
          Come arriva un no
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Il turno non cambia nel momento in cui la persona rifiuta: cambia
          quando{" "}
          <strong className="font-medium text-text">apri i messaggi</strong> in
          cima ai Turni, così lo vedi mentre succede. Se nel frattempo quel
          turno l&apos;avevi già cambiato tu, il rifiuto non tocca niente: vale
          l&apos;ultima parola tua.
        </p>
      </div>

      {/* --------------------------------- 1 · pubblichi la settimana --- */}
      <Gesto
        icona={Send}
        titolo="Quando pubblichi la settimana"
        nota="È il momento in cui i dipendenti vedono la settimana. Prima la vedi solo tu."
      >
        <Regola>
          Se qualcuno ha <strong className="font-medium text-text">meno ore</strong>{" "}
          di quelle del suo contratto, l&apos;app te lo dice prima di
          pubblicare, con il nome e quante ore mancano. Puoi pubblicare lo
          stesso, ma te lo chiede prima. Finché la vedi solo tu non ti
          dice niente. Chi è a chiamata non ha ore da rispettare, e chi è
          assente conta solo per i giorni in cui c&apos;è.
        </Regola>
        <Interruttore
          acceso={v.conferma_settimana}
          onCambia={(x) => cambia({ conferma_settimana: x })}
          titolo="Chiedi conferma per le settimane con straordinario"
          descrizione="Il dipendente riceve una domanda sola su tutta la settimana, non una per ogni turno. Può accettarla o rifiutarla; accettando può anche chiederti un piccolo cambio."
          quando="pubblichi una settimana che porta qualcuno oltre le ore del suo contratto"
          esito="deve scriverti il motivo, e tu lo leggi nei messaggi. I turni non si muovono di un minuto: la settimana la rifai tu, come vuoi"
        />
      </Gesto>

      {/* ------------------------ 2 · cambi un turno gia' pubblicato --- */}
      <Gesto
        icona={PencilLine}
        titolo="Quando cambi un turno già pubblicato"
        nota="Finché la settimana la vedi solo tu puoi cambiare tutto senza avvisare nessuno."
      >
        <Interruttore
          acceso={v.conferma_modifiche}
          onCambia={(x) => cambia({ conferma_modifiche: x })}
          titolo="Avvisa il dipendente quando cambi un suo turno"
          descrizione="Se il turno diventa più lungo, o cambia giorno o orario, il dipendente lo può rifiutare. Se invece diventa più corto, o glielo togli, riceve solo un avviso da leggere: non c'è niente da accettare."
          quando="allunghi, sposti, accorci o cancelli un turno di una settimana già pubblicata"
          esito="aprendo i messaggi il turno torna esattamente com'era prima della tua modifica, con scritto il motivo"
        />

        <Avanzate
          riepilogo={
            v.conferma_cambio_reparto
              ? "Acceso: spostare qualcuno di reparto, a orari invariati, gli si può rifiutare."
              : "Spento: spostare qualcuno di reparto, a orari invariati, non chiede niente a nessuno."
          }
        >
          <Interruttore
            acceso={v.conferma_cambio_reparto}
            onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
            titolo="Avvisa anche solo per il cambio di reparto"
            descrizione="Serve se sposti qualcuno da un reparto all'altro senza cambiargli gli orari. Di solito si lascia spento: le ore restano le stesse, e chi non ha reparti non lo usa mai."
            quando="cambi solo il reparto, e nient'altro: stessa persona, stesso giorno, stessi orari"
            esito="aprendo i messaggi il turno torna al reparto di prima"
          />
        </Avanzate>
      </Gesto>

      {/* ------------------------------------ 3 · aggiungi un turno --- */}
      <Gesto
        icona={Plus}
        titolo="Quando aggiungi un turno"
        nota="Un turno appena creato non ha una versione precedente a cui tornare: se lo rifiutano, sparisce."
      >
        <Interruttore
          acceso={v.conferma_straordinari}
          onCambia={(x) => cambia({ conferma_straordinari: x })}
          titolo="Straordinari da accettare"
          descrizione="Vale per chi ha un contratto a ore. Chi è a chiamata non ha ore da rispettare, quindi non lo riguarda."
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
            descrizione="Vale solo per chi ha un orario fisso scritto nella sua scheda, in Squadra. Chi non ce l'ha non è interessato, e in un negozio di solito non ce l'ha nessuno."
            quando="gli dai un turno con orari diversi da quelli scritti nella sua scheda"
            esito="aprendo i messaggi il turno viene cancellato e quel giorno torna vuoto, come sopra"
          />
        </Avanzate>
      </Gesto>

      {/* ---------------------------- 4 · un turno a chi e' a chiamata --- */}
      <Gesto
        icona={PhoneCall}
        titolo="Quando dai un turno a chi lavora a chiamata"
        nota="Vale solo per chi ha «a chiamata» nella sua scheda, in Squadra. Chi ha un contratto a ore segue le regole qui sopra."
      >
        <Scelta
          valore={v.regime_chiamata}
          onCambia={(x) => cambia({ regime_chiamata: x })}
          opzioni={[
            {
              valore: "indisponibilita",
              titolo: "Segnala quando non può",
              descrizione:
                "Il dipendente segna sul calendario i giorni in cui non c'è. Tutti gli altri sono liberi e lo chiami senza chiedere niente.",
              quando: "provi a dargli un turno in un giorno che ha segnato",
              esito: "l'app non ti lascia salvare, e ti dice quali ore aveva escluso",
            },
            {
              valore: "disponibilita",
              titolo: "Segnala quando può",
              descrizione:
                "Il dipendente segna i giorni in cui è disponibile, e i turni glieli puoi dare solo lì. Finché non segna niente non gli puoi dare turni: qui il vincolo è tuo, non suo.",
              quando: "provi a dargli un turno fuori dai giorni e dalle ore che ha segnato",
              esito: "l'app non ti lascia salvare: o stringi il turno, o gli chiedi di allargare la disponibilità",
            },
            {
              valore: "on_demand",
              titolo: "Chiedi ogni volta",
              descrizione:
                "Niente calendario, né in un verso né nell'altro: il dipendente non segna niente. Gli dai il turno e lui risponde, una chiamata per volta. Quando pubblichi la settimana riceve una domanda sola su tutta la settimana, e la accetta o la rifiuta intera scrivendoti cosa vorrebbe cambiare.",
              quando: "gli dai o gli cambi un turno di una settimana già pubblicata",
              esito:
                "aprendo i messaggi, un turno appena creato viene cancellato — quel giorno torna vuoto, non resta scoperto da riassegnare — mentre un turno che avevi solo cambiato torna com'era. Quella chiamata devi rifarla a qualcun altro",
            },
          ]}
        />
        {v.regime_chiamata === "on_demand" ? (
          <p className="pb-3.5 text-[12.5px] leading-relaxed text-warning">
            Attenzione: con questa scelta il turno di chi è a chiamata{" "}
            <strong className="font-medium">vale solo se lui accetta</strong>. È
            l&apos;unico caso in tutta l&apos;app in cui il silenzio non vuol
            dire sì — fino alla risposta, quel posto non è coperto.
          </p>
        ) : (
          <p className="pb-3.5 text-[12.5px] leading-relaxed text-muted">
            Il calendario si riempie da «Disponibilità», nel menu. Lo vedono i
            tuoi dipendenti a chiamata, e lo vedi tu per tutti: se uno ti
            telefona, la sua disponibilità puoi segnarla al posto suo.
          </p>
        )}
      </Gesto>

      {/* --------------------------------- 5 · qualcuno chiede ferie --- */}
      <Gesto
        icona={Sun}
        titolo="Quando qualcuno chiede ferie"
        nota="Ferie, malattie e permessi: i dipendenti li chiedono, tu decidi. Succede nella pagina Permessi."
        pagina="Permessi"
        accesa={v.pagina_permessi}
        onCambiaPagina={(x) => cambia({ pagina_permessi: x })}
        spegnimento="Spenta, la pagina sparisce dal menu di tutti e nessuno ti può più chiedere niente. Le assenze le registri lo stesso tu, dai Turni."
      >
        <Avanzate
          riepilogo={`${v.causali_richiedibili.length} motivi su ${CODICI_CAUSALE.length} si possono chiedere dall'app. Gli altri li registri solo tu.`}
          disabilitato={!v.pagina_permessi}
        >
          <div className="space-y-3 py-3.5">
            <p className="text-[12.5px] text-muted">
              Cosa un dipendente può chiedere da solo. Tocca una voce per
              toglierla o rimetterla. Tu puoi registrare qualsiasi assenza a
              mano, anche quelle spente qui.
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
        nota="La giornata ora per ora: chi c'è, in quale reparto, e dove manca gente. Succede nella pagina Supervisione."
        pagina="Supervisione"
        accesa={v.pagina_supervisione}
        onCambiaPagina={(x) => cambia({ pagina_supervisione: x })}
        spegnimento="Spenta, la pagina sparisce dal menu di tutti. I turni della giornata restano dove sono: li vedi dal tabellone."
      >
        <Interruttore
          acceso={v.supervisione_dipendenti}
          onCambia={(x) => cambia({ supervisione_dipendenti: x })}
          titolo="Visibile anche ai dipendenti"
          descrizione="Accesa, anche i dipendenti vedono com'è coperta la giornata. Spenta, la pagina resta solo a te."
          quando="un dipendente apre l'app: la voce Supervisione gli compare, oppure non gli compare"
          etichettaEsito="Cosa vede"
          esito="i turni di tutti nella giornata, reparto per reparto. Il motivo di un'assenza non lo vede: quello resta fra te e l'interessato"
          spento={!v.pagina_supervisione}
        />
      </Gesto>

      {/* --------------------------------- 7 · i conti a fine mese --- */}
      <Gesto
        icona={ClipboardList}
        titolo="Quando fai i conti a fine mese"
        nota="Il riepilogo delle ore di ogni persona: lavorate, perse e per quale motivo. Succede nella pagina Prospetto, e la vedi solo tu."
        pagina="Prospetto"
        accesa={v.pagina_prospetto}
        onCambiaPagina={(x) => cambia({ pagina_prospetto: x })}
        spegnimento="Spenta, la pagina sparisce dal tuo menu. Le ore restano registrate lo stesso: riaccendendola le ritrovi tutte."
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

/** «Non in uso», scritto uguale ovunque.
 *
 *  E' il modo in cui questa schermata dice che una cosa c'e' ma non vale.
 *  L'altro modo — sbiadire il blocco — e' stato tolto il 30 agosto 2026:
 *  portava il testo a 2,0-2,3 di contrasto, cioe' sotto il minimo leggibile,
 *  e a farne le spese era la riga che spiega cosa fa la levetta. Chi guarda
 *  una regola spenta la sta leggendo apposta, per decidere se accenderla. */
function NonInUso() {
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-faint">
      non in uso
    </span>
  );
}

/** Un gesto: il momento in cui quelle regole scattano.
 *
 *  Se `onCambiaPagina` c'e', quel gesto vive dentro una pagina che si puo'
 *  spegnere: l'interruttore sta nell'intestazione, dove si legge come parte
 *  del nome, e quello che c'e' dentro si spegne con lei. */
function Gesto({
  icona: Icona,
  titolo,
  nota,
  pagina,
  accesa = true,
  onCambiaPagina,
  spegnimento,
  children,
}: {
  icona: LucideIcon;
  titolo: string;
  nota?: string;
  /** Il nome della pagina che si spegne. Serve all'etichetta della levetta:
   *  «usa questo gesto» non vuol dire niente, «usa la pagina Permessi» si'. */
  pagina?: string;
  accesa?: boolean;
  onCambiaPagina?: (v: boolean) => void;
  /** Cosa succede spegnendo la pagina. Una levetta che fa sparire una voce
   *  di menu a tutta l'azienda non si preme al buio. */
  spegnimento?: string;
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
          {spegnimento ? (
            <p className="mt-0.5 text-[12.5px] text-faint">{spegnimento}</p>
          ) : null}
        </div>
        {onCambiaPagina ? (
          <Levetta
            acceso={accesa}
            onCambia={onCambiaPagina}
            etichetta={`Usa la pagina ${pagina ?? titolo}`}
          />
        ) : null}
      </header>

      {children ? (
        <div className="divide-y divide-border px-4">{children}</div>
      ) : null}
    </section>
  );
}

/** Quello che un negozio non tocca mai: chiuso, ma non nascosto.
 *
 *  La riga di riepilogo non e' decorazione, e' la condizione perche' il
 *  richiudibile non sia una trappola. Chiuso, un pannello dice «qui dentro
 *  non succede niente»: se pero' dentro c'e' una levetta accesa, la
 *  schermata sta mentendo a chi non lo apre. La riga dice lo stato vero
 *  senza aprire.
 *
 *  E' un `<details>` vero e non uno stato di React: si apre senza
 *  JavaScript, risponde alla tastiera e lo sa gia' leggere il lettore di
 *  schermo. */
function Avanzate({
  riepilogo,
  disabilitato,
  children,
}: {
  riepilogo: string;
  /** La pagina che lo contiene e' spenta: si legge, non si apre. */
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
        <span
          aria-hidden
          className="mt-0.5 shrink-0 text-[13px] text-faint transition-transform group-open:rotate-90"
        >
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            Impostazioni avanzate
            {disabilitato ? <NonInUso /> : null}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted">
            {riepilogo}
          </span>
        </span>
      </summary>
      <div className="mt-1 divide-y divide-border">{children}</div>
    </details>
  );
}

function Interruttore({
  acceso,
  onCambia,
  titolo,
  descrizione,
  quando,
  esito,
  etichettaEsito = "Se dice no",
  spento,
}: {
  acceso: boolean;
  onCambia: (v: boolean) => void;
  titolo: string;
  descrizione: string;
  /** Il gesto che fa scattare la regola: «allunghi un turno», «pubblichi».
   *  Sta su una riga sua perche' e' la prima cosa che si cerca — «questa mi
   *  riguarda?» — e dentro un paragrafo bisogna trovarla leggendo. */
  quando?: string;
  /** Cosa succede se la persona dice di no. Chi accende un interruttore
   *  vuole sapere dove va a finire, non solo cosa attiva. */
  esito?: string;
  /** Non tutte le levette aprono a un rifiuto: su quelle che decidono chi
   *  vede cosa, «se dice no» sarebbe una domanda senza risposta. Le righe
   *  restano due, cambia il titolo della seconda invece di inventarsi un
   *  rifiuto che non esiste. */
  etichettaEsito?: string;
  /** La pagina che lo contiene e' spenta: la regola resta scritta ma non
   *  vale, e si vede che non vale. */
  spento?: boolean;
}) {
  // Spento non vuol dire sbiadito. Sbiadire e' l'unica cosa che non si puo'
  // fare qui: chi legge una levetta spenta sta cercando di capire *cosa fa*
  // per decidere se accenderla, e il testo che glielo spiega e' proprio
  // quello che l'opacita' rendeva illeggibile (2,10 di contrasto: sotto il
  // minimo di 4,5). Lo stato si dice a parole, come nell'intestazione.
  return (
    <div className="flex items-start gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {titolo}
          {spento ? <NonInUso /> : null}
        </p>
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
                <dt className="shrink-0 text-faint">{etichettaEsito}</dt>
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

/** Una scelta fra tre, dove una levetta non basta.
 *
 *  Le regole di ingaggio di chi è a chiamata non sono un interruttore acceso
 *  o spento: sono tre accordi diversi, e il secondo non è «il primo di più».
 *  Un elenco di tre levette lascerebbe accenderne due, che non vuol dire
 *  niente, o nessuna, che vuol dire ancora meno.
 *
 *  Ogni voce dice le stesse due cose delle levette — *quando* scatta e *cosa
 *  succede* — perché sono le due domande che uno si fa scegliendo, e dentro
 *  un paragrafo bisogna trovarle leggendo. */
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
    descrizione: string;
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
              {scelta ? (
                <span className="size-2 rounded-full bg-accent" />
              ) : null}
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
              <span className="mt-0.5 block text-[12.5px] text-muted">
                {o.descrizione}
              </span>
              <span className="mt-1.5 block space-y-0.5 text-[12.5px]">
                <span className="flex gap-1.5">
                  <span className="shrink-0 text-faint">Quando</span>
                  <span className="min-w-0 text-muted">{o.quando}</span>
                </span>
                <span className="flex gap-1.5">
                  <span className="shrink-0 text-faint">Se dice no</span>
                  <span className="min-w-0 text-muted">{o.esito}</span>
                </span>
              </span>
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

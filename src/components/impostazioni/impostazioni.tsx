"use client";

import {
  CalendarPlus,
  Eye,
  LayoutGrid,
  Send,
  SlidersHorizontal,
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
 *  Rifatta il 2 settembre 2026: la pagina era scritta come se esistesse solo
 *  il telefono. Il guscio dell'app da' fino a `max-w-[100rem]` e qui se ne
 *  usavano `max-w-2xl` — su un monitor, 672px di nastro verticale e
 *  novecento pixel di niente a destra, col salvataggio automatico annunciato
 *  a tre schermate dalla leva appena toccata. Da 1024px le schede stanno su
 *  due colonne; sotto, non cambia una riga.
 *
 *  **L'ordine delle quattro sezioni e' quello che pareggia le colonne**, e
 *  non l'ordine per cui l'ho scritto la prima volta. La divisione «a sinistra
 *  cosa esiste, a destra cosa succede quando muovi un turno» era piu' bella a
 *  raccontarsi e lasciava la colonna destra **450px piu' lunga** della
 *  sinistra: sono le due sezioni piu' alte una sopra l'altra. Adesso l'asse e'
 *  un altro e regge lo stesso — a sinistra l'app e la settimana, a destra le
 *  persone — e le due colonne finiscono alla stessa altezza.
 *
 *  Le sei aggregazioni «per gesto» sono diventate quattro per ambito. Il
 *  gesto non e' sparito, e' sceso di un livello: sta nella riga «Quando
 *  scatta». Sei intestazioni che cominciavano tutte per «Quando» erano un
 *  indice inutile su una colonna, e su due sarebbero state sei volte la
 *  stessa parola nella stessa schermata.
 *
 *  Sul registro dei testi: chi apre questa pagina sta **decidendo**, non
 *  imparando. L'etichetta e' un sostantivo, la descrizione dice cosa cambia
 *  in azienda, la rassicurazione e' un fatto — «il turno resta valido» — e
 *  non una pacca sulla spalla. Ma tecnico non vuol dire contorto: dove una
 *  frase nominale si capiva meno di un verbo, vince il verbo. «La persona
 *  puo' rifiutare un turno che la porta oltre le ore del contratto» batte
 *  «un turno oltre le ore contrattuali diventa rifiutabile». */
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

  const richiedibili = v.causali_richiedibili.length;

  /** La testata resta in cima mentre si scorre, e appena si stacca si
   *  accorcia: la riga che spiega cosa sono queste impostazioni serve a chi
   *  arriva, non a chi sta gia' scorrendo, e su un telefono una barra fissa a
   *  due righe si mangia un sesto dello schermo per sempre.
   *
   *  La sentinella e' un pixel in cima al contenuto: quando esce dalla vista
   *  la testata e' incollata. Si guarda cosi' e non con l'evento di
   *  scorrimento perche' **a scorrere non e' la finestra** — e' il `<main>`
   *  del guscio, che ha `overflow-y-auto` — e l'osservatore quel dettaglio lo
   *  gestisce da solo. */
  const sentinella = React.useRef<HTMLDivElement>(null);
  const [compatta, setCompatta] = React.useState(false);

  React.useEffect(() => {
    const nodo = sentinella.current;
    if (!nodo) return;
    const osservatore = new IntersectionObserver(
      ([voce]) => setCompatta(!voce.isIntersecting),
    );
    osservatore.observe(nodo);
    return () => osservatore.disconnect();
  }, []);

  return (
    <div className="relative mx-auto flex max-w-2xl flex-col gap-4 lg:max-w-6xl lg:gap-6">
      {/* Fuori flusso, o il `gap` qui sopra la conterebbe come una scheda. */}
      <div
        ref={sentinella}
        aria-hidden
        className="absolute left-0 top-[-1.25rem] h-px w-px sm:top-[-1.75rem]"
      />
      {/* La testata e' l'unica cosa fissa della pagina. Il fondo lo mette
          `glass` — lo stesso della barra in alto — e **solo da staccata**:
          a riposo dietro c'e' lo sfondo d'ambiente del guscio, e un
          `bg-canvas` piatto ci si vedrebbe sopra come una toppa. I margini
          negativi la portano fino al bordo della colonna, se no il contenuto
          scorrerebbe scoperto nei quattro pixel di lato. */}
      <div
        className={cn(
          "sticky top-0 z-20 -mx-4 -mt-5 flex items-start justify-between gap-3 px-4 transition-[padding,background-color] duration-200 motion-reduce:transition-none sm:-mx-6 sm:-mt-7 sm:px-6",
          compatta
            ? "glass border-b border-border pb-3 pt-3 sm:pt-3.5"
            : "pb-1 pt-5 sm:pt-7",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <SlidersHorizontal className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-[19px] font-semibold leading-tight tracking-tight">
                Impostazioni
              </h1>
              <span className="max-w-full truncate rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-medium text-muted">
                {azienda}
              </span>
            </div>
            {/* Non `hidden`: sparire di colpo e' uno scatto, e questa riga
                sta sopra a tutto il resto della pagina. */}
            <p
              className={cn(
                "overflow-hidden text-[13.5px] text-muted transition-all duration-200 motion-reduce:transition-none",
                compatta ? "max-h-0 opacity-0" : "mt-0.5 max-h-12 opacity-100",
              )}
            >
              Valgono per tutta l&apos;azienda. Ogni modifica si salva da sola.
            </p>
          </div>
        </div>

        {/* Il salvataggio e' silenzioso, ma non muto: senza questa pastiglia
            l'unica conferma sarebbe la leva stessa, che era gia' li'. Il
            pallino porta lo stato anche a chi il verde e il rosso non li
            distingue. */}
        <p
          aria-live="polite"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity duration-200 motion-reduce:transition-none",
            stato === "in_corso" && "bg-surface-3 text-muted",
            stato === "salvato" && "bg-success-soft text-success",
            stato === "errore" && "bg-danger-soft text-danger",
            stato === "fermo" && "opacity-0",
          )}
        >
          {stato === "fermo" ? null : (
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                stato === "in_corso" && "animate-pulse bg-faint motion-reduce:animate-none",
                stato === "salvato" && "bg-success",
                stato === "errore" && "bg-danger",
              )}
            />
          )}
          {stato === "in_corso"
            ? "Salvataggio…"
            : stato === "salvato"
              ? "Salvato"
              : stato === "errore"
                ? "Non salvato"
                : ""}
        </p>
      </div>

      {/* Il modello di tutta la pagina, e la sua unica eccezione. Vengono
          prima di tutto: senza, ogni levetta qui sotto sembra decidere se il
          turno vale, e non e' quello che fanno. Affiancati da lg. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13.5px] leading-relaxed text-muted lg:px-5 lg:py-4">
          Un turno vale dal momento in cui lo salvi. Le regole di questa pagina
          decidono soltanto <strong className="font-medium text-text">chi
          può rifiutarlo</strong>, e in quali casi: se nessuno risponde, il
          turno resta valido.
        </p>

        <details className="group rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card lg:px-5 lg:py-4">
          <summary className="tap flex cursor-pointer list-none items-start gap-2">
            <Freccia />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">
                Quando un rifiuto ha effetto
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">
                Non nel momento in cui la persona rifiuta: quando apri i
                messaggi.
              </span>
            </span>
          </summary>
          <p className="mt-2 pl-5 text-[13px] leading-relaxed text-muted">
            Il rifiuto resta in attesa nei messaggi, in cima ai Turni. Il turno
            cambia nel momento in cui{" "}
            <strong className="font-medium text-text">li apri</strong>, così lo
            vedi cambiare mentre lo guardi. Se intanto quel turno l&apos;avevi
            già modificato tu, il rifiuto non tocca niente: vale la modifica
            tua, che è l&apos;ultima.
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
        {/* --------------------------------------- l'app, e la settimana --- */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <Sezione
            icona={LayoutGrid}
            titolo="Moduli attivi"
            nota="Quattro moduli si possono spegnere: spariscono dal menu, e quello che contengono resta registrato."
            piede="Turni, Squadra e Impostazioni sono moduli di base e non si spengono."
          >
            <Modulo
              nome="Permessi"
              breve="I dipendenti chiedono ferie e permessi dall'app. Da spento, le assenze le registri tu dai Turni."
              acceso={v.pagina_permessi}
              onCambia={(x) => cambia({ pagina_permessi: x })}
            />
            <Modulo
              nome="Supervisione"
              breve="Chi è in turno adesso, ora per ora e reparto per reparto."
              acceso={v.pagina_supervisione}
              onCambia={(x) => cambia({ pagina_supervisione: x })}
            />
            <Modulo
              nome="Prospetto"
              breve="Il conto delle ore a fine mese. Lo vedi solo tu."
              acceso={v.pagina_prospetto}
              onCambia={(x) => cambia({ pagina_prospetto: x })}
            />
            <Modulo
              nome="Disponibilità"
              breve="Chi lavora a chiamata compila il proprio calendario dall'app. Da spento, lo compili tu dal tabellone."
              acceso={v.pagina_disponibilita}
              onCambia={(x) => cambia({ pagina_disponibilita: x })}
            />
          </Sezione>

          <Sezione
            icona={Send}
            titolo="Pubblicazione e modifiche"
            nota="Cosa succede quando pubblichi una settimana, o cambi un turno già pubblicato."
          >
            <Regola
              titolo="Controllo delle ore da contratto"
              breve="Prima di pubblicare, l'app ti dice chi resta sotto le ore del suo contratto, coi nomi."
              dettagli="È una segnalazione, non un blocco: puoi pubblicare lo stesso. Finché la settimana la vedi solo tu non ti dice niente. Chi lavora a chiamata non ha ore da rispettare, e chi è assente conta solo per i giorni in cui c'è."
            />
            <Interruttore
              acceso={v.conferma_settimana}
              onCambia={(x) => cambia({ conferma_settimana: x })}
              titolo="Straordinari alla pubblicazione"
              breve="Quando pubblichi, chi va oltre le ore del suo contratto riceve una richiesta sola per tutta la settimana."
              quando="Pubblichi una settimana che porta qualcuno oltre le ore del suo contratto."
              esito="Chi rifiuta scrive il motivo, e lo leggi nei messaggi. I turni non si muovono di un minuto: la settimana la rifai tu, come vuoi."
            />
            <Interruttore
              acceso={v.conferma_modifiche}
              onCambia={(x) => cambia({ conferma_modifiche: x })}
              titolo="Avviso a chi subisce la modifica"
              breve="Un turno allungato o spostato la persona può rifiutarlo; uno accorciato o cancellato lo legge e basta."
              quando="Allunghi, sposti, accorci o cancelli un turno di una settimana già pubblicata."
              esito="Quando apri i messaggi, il turno torna esattamente com'era prima della tua modifica, col motivo scritto."
            />
            <Avanzate
              riepilogo={
                v.conferma_cambio_reparto
                  ? "Anche il solo cambio di reparto si può rifiutare."
                  : "Il solo cambio di reparto non avvisa nessuno."
              }
            >
              <Interruttore
                acceso={v.conferma_cambio_reparto}
                onCambia={(x) => cambia({ conferma_cambio_reparto: x })}
                titolo="Avvisa anche per il solo reparto"
                breve="Stessa persona, stesso giorno, stessi orari: cambia solo il reparto."
                quando="Cambi il reparto di un turno, e nient'altro."
                esito="Quando apri i messaggi, il turno torna al reparto di prima."
              />
            </Avanzate>
          </Sezione>
        </div>

        {/* ------------------------------------------------- le persone --- */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <Sezione
            icona={Eye}
            titolo="Cosa vedono e cosa chiedono i dipendenti"
            nota="Quanto della giornata è visibile a tutti, e cosa una persona può chiedere da sola."
          >
            <Interruttore
              acceso={v.supervisione_dipendenti}
              onCambia={(x) => cambia({ supervisione_dipendenti: x })}
              titolo="Supervisione visibile ai dipendenti"
              breve="Anche i dipendenti vedono chi è in turno nella giornata. Il motivo di un'assenza no."
              quando="Un dipendente apre l'app: nel suo menu compare la voce Supervisione."
              etichettaEsito="Cosa vede"
              esito="I turni di tutti nella giornata, reparto per reparto. Il motivo di un'assenza resta fra te e l'interessato."
              spento={!v.pagina_supervisione}
            />
            <Avanzate
              riepilogo={`${richiedibili} ${richiedibili === 1 ? "motivo" : "motivi"} di assenza su ${CODICI_CAUSALE.length} si possono chiedere dall'app.`}
              disabilitato={!v.pagina_permessi}
            >
              <div className="space-y-3 py-3.5">
                <p className="text-[13px] text-muted">
                  Cosa un dipendente può chiedere da solo. Tocca un motivo per
                  toglierlo o rimetterlo: quelli spenti li registri comunque
                  tu, senza limiti.
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

          <Sezione
            icona={CalendarPlus}
            titolo="Turni nuovi e lavoro a chiamata"
            nota="Cosa succede nel momento in cui assegni un turno."
          >
            <Interruttore
              acceso={v.conferma_straordinari}
              onCambia={(x) => cambia({ conferma_straordinari: x })}
              titolo="Straordinari sul singolo turno"
              breve="La persona può rifiutare un turno che la porta oltre le ore settimanali del suo contratto."
              quando="Dai a qualcuno un turno che lo porta oltre le ore settimanali del suo contratto."
              esito="Quando apri i messaggi il turno sparisce e quel giorno torna vuoto: non resta un turno scoperto da riassegnare. Il promemoria te lo tiene la casella dei messaggi, finché non rifai quelle ore o non la chiudi."
            />
            <Avanzate
              riepilogo={
                v.orari_preimpostati
                  ? "Un turno con orari diversi da quelli in scheda si può rifiutare."
                  : "Un turno con orari diversi da quelli in scheda vale come tutti gli altri."
              }
            >
              <Interruttore
                acceso={v.orari_preimpostati}
                onCambia={(x) => cambia({ orari_preimpostati: x })}
                titolo="Orari diversi da quelli in scheda"
                breve="Chi ha un orario fisso scritto in scheda, in Squadra, può rifiutare un turno con orari diversi."
                quando="Gli dai un turno con orari diversi da quelli scritti nella sua scheda."
                esito="Quando apri i messaggi il turno sparisce e quel giorno torna vuoto, come sopra."
              />
            </Avanzate>

            {/* Non e' una levetta e non e' un'avanzata: e' la terza cosa che
                si decide qui dentro, e ha bisogno del suo titolo. */}
            <div className="py-3.5 lg:py-4">
              <p className="text-[14px] font-medium">
                L&apos;accordo con chi lavora a chiamata
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                Vale per chi ha «a chiamata» nella sua scheda, in Squadra. Sono
                tre accordi diversi: se ne sceglie uno.
              </p>
              <Scelta
                valore={v.regime_chiamata}
                onCambia={(x) => cambia({ regime_chiamata: x })}
                opzioni={[
                  {
                    valore: "indisponibilita",
                    titolo: "Segna i giorni in cui non può",
                    breve:
                      "In tutti gli altri giorni lo metti in turno senza chiedere niente.",
                    quando:
                      "Provi a dargli un turno in un giorno che aveva segnato.",
                    esito:
                      "L'app non ti lascia salvare, e ti dice quali ore aveva escluso.",
                  },
                  {
                    valore: "disponibilita",
                    titolo: "Segna i giorni in cui può",
                    breve:
                      "Fuori da quei giorni non lo puoi mettere in turno. Finché non segna niente non riceve turni: il vincolo è tuo.",
                    quando:
                      "Provi a dargli un turno fuori dai giorni e dalle ore che aveva segnato.",
                    esito:
                      "L'app non ti lascia salvare: o accorci il turno, o gli chiedi di allargare la disponibilità.",
                  },
                  {
                    valore: "on_demand",
                    titolo: "Gli chiedi ogni volta",
                    breve:
                      "Nessun calendario: ogni turno è una proposta, e vale solo se lui lo accetta.",
                    quando:
                      "Gli dai o gli cambi un turno di una settimana già pubblicata.",
                    esito:
                      "Quando apri i messaggi: un turno appena creato sparisce e quel giorno torna vuoto; un turno che avevi solo cambiato torna com'era. Quella chiamata la rifai a qualcun altro.",
                  },
                ]}
              />
              {v.regime_chiamata === "on_demand" ? (
                <p className="text-[13px] leading-relaxed text-warning">
                  Attenzione: con questa scelta il turno di chi è a chiamata{" "}
                  <strong className="font-medium">
                    vale solo se lui lo accetta
                  </strong>
                  . È l&apos;unico caso in tutta l&apos;app in cui il silenzio
                  non vuol dire sì.
                </p>
              ) : v.pagina_disponibilita ? (
                <p className="text-[13px] leading-relaxed text-muted">
                  Il calendario lo compila lui da «Disponibilità»; se ti
                  telefona, puoi compilarlo tu al posto suo.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">
                  Il modulo Disponibilità è spento: il calendario lo compili tu
                  dal tabellone, nella vista «Disponibilità». L&apos;accordo
                  scelto qui vale lo stesso.
                </p>
              )}
            </div>
          </Sezione>
        </div>
      </div>
    </div>
  );
}

/** «Spento», scritto uguale ovunque.
 *
 *  E' il modo in cui questa schermata dice che una cosa c'e' ma non vale.
 *  L'altro modo — sbiadire il blocco — e' stato tolto il 30 agosto 2026:
 *  portava il testo sotto il minimo leggibile, e a farne le spese era
 *  proprio la riga che spiega cosa fa la levetta. */
function NonInUso() {
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium uppercase tracking-wide text-faint">
      spento
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
      <header className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 lg:px-5 lg:py-3.5">
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
        <div className="divide-y divide-border px-4 lg:px-5">{children}</div>
      ) : null}
      {piede ? (
        <p className="border-t border-border bg-surface-2 px-4 py-2.5 text-[12.5px] text-faint lg:px-5 lg:py-3">
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
    <div className="flex items-center gap-3 py-3 lg:py-3.5">
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
    <details className="group py-3.5 lg:py-4">
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
  etichettaEsito = "Se rifiuta",
}: {
  quando?: string;
  esito?: string;
  etichettaEsito?: string;
}) {
  if (!quando && !esito) return null;
  return (
    <details className="group mt-1.5">
      <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-faint hover:text-muted">
        <Freccia />
        Come funziona
      </summary>
      <dl className="mt-1.5 space-y-1 pl-5 text-[13px]">
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
    <div className="flex items-start gap-3 py-3.5 lg:py-4">
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
 *  «Esito» e non «Se rifiuta»: due regimi su tre **bloccano il salvataggio**,
 *  e li' un rifiuto e' una cosa che non succede. */
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
                <span className="mt-1.5 block space-y-1 text-[13px]">
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
    <div className="py-3.5 lg:py-4">
      <div className="rounded-xl bg-surface-2 px-3.5 py-3 lg:px-4 lg:py-3.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-success">
          Sempre attiva
        </p>
        <p className="mt-1 text-[14px] font-medium">{titolo}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{breve}</p>
        {dettagli ? (
          <details className="group mt-1.5">
            <summary className="tap flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-faint hover:text-muted">
              <Freccia />
              Come funziona
            </summary>
            <p className="mt-1.5 pl-5 text-[13px] leading-relaxed text-muted">
              {dettagli}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

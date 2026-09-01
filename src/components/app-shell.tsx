"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Eye,
  KeyRound,
  LogOut,
  Settings2,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Marchio } from "@/components/ui/marchio";
import { usePathname } from "next/navigation";
import * as React from "react";
import { PannelloCambiaPassword } from "@/components/auth/cambia-la-mia-password";
import { useScorrimentoPagine } from "@/components/scorrimento-pagine";
import { CaricamentoMarchio } from "@/components/ui/caricamento-marchio";
import { ThemeToggle } from "@/components/ui/theme";
import { cn } from "@/lib/utils";

/** Le icone non si possono passare da un Server Component a un Client
 *  Component: attraversano il confine solo dati serializzabili. Il server
 *  manda una chiave, la mappa sta qui. */
const ICONS = {
  calendar: CalendarDays,
  users: Users,
  building: Building2,
  eye: Eye,
  prospetto: ClipboardList,
  sun: Sun,
  disponibilita: CalendarClock,
  settings: Settings2,
} as const;

export type Section = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
};

export function AppShell({
  title,
  sections,
  voci = [],
  identity,
  esci,
  children,
}: {
  title: string;
  /** Le voci della barra: quelle che si aprono ogni giorno. */
  sections: Section[];
  /** Le voci che si aprono una volta a settimana o al mese — Squadra,
   *  Impostazioni, Aziende. Stanno nella tendina dell'iniziale e non nella
   *  barra: occupavano tre posti su sette, e «Aziende» in particolare cambia
   *  guscio, titolo e menu a chi la tocca per sbaglio — cioè all'unico
   *  account con cui si fa vedere l'app. */
  voci?: Section[];
  identity: { name: string; email: string; roleLabel: string };
  esci: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [cambioPassword, setCambioPassword] = React.useState(false);
  const moduloEsci = React.useRef<HTMLFormElement>(null);

  /* ------------------------------------------------ tira giu' e aggiorna
   * Il gesto del telefono: dal bordo alto del contenuto si tira giu', il
   * marchio scende ruotando con il dito, e oltre la soglia l'app si
   * ricarica per intero. Gli ascoltatori stanno su addEventListener perche'
   * serve `passive: false`: senza, il preventDefault che tiene fermo lo
   * scorrimento durante il tiro non ha effetto. Il ricaricamento e' quello
   * vero (location.reload), non un refresh morbido: chi tira giu' vuole la
   * certezza di guardare dati freschi, non una via di mezzo. */
  const principale = React.useRef<HTMLElement>(null);

  /* ------------------------------------------------- scorri e cambi pagina
   * L'altro gesto del telefono: si trascina di lato e si passa alla voce
   * accanto della barra. Vive qui e non nelle pagine perche' e' la barra a
   * dare l'ordine, e la barra sta in questo file: il dito e il pulsante
   * portano nello stesso posto per costruzione, non per manutenzione.
   *
   * Le pagine non si preallineano a mano: le voci della barra sono `<Link>`
   * in vista, e Next le prende gia' in anticipo per conto suo — con
   * `staleTimes.dynamic: 30` (next.config.ts) chi scorre avanti e indietro
   * fra due pagine non rifa il giro fino all'Ohio ogni volta. */
  const { foglio, orizzontale, anteprima, classeEntrata, entrataFinita } =
    useScorrimentoPagine(principale, sections.map((s) => s.href));

  const [tiro, setTiro] = React.useState(0);
  // Vero mentre il dito e' giu': durante il tiro l'indicatore sta incollato
  // al dito (niente transizione), al rilascio rientra morbido.
  const [inTiro, setInTiro] = React.useState(false);
  const [ricarico, setRicarico] = React.useState(false);
  const statoTiro = React.useRef({ y0: 0, valore: 0, attivo: false });

  React.useEffect(() => {
    const el = principale.current;
    if (!el) return;

    const aggiorna = (v: number) => {
      statoTiro.current.valore = v;
      setTiro(v);
    };
    const inizio = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      statoTiro.current = { y0: e.touches[0].clientY, valore: 0, attivo: true };
      setInTiro(true);
    };
    const movimento = (e: TouchEvent) => {
      if (!statoTiro.current.attivo) return;
      // Stesso dito, due gesti: a schermo in cima si contendono i primi
      // pixel, e chi ha deciso per primo si tiene il gesto. Senza questa
      // riga, un trascinamento di lato appena inclinato faceva scendere
      // anche il marchio del ricaricamento.
      if (orizzontale.current) {
        statoTiro.current.attivo = false;
        if (statoTiro.current.valore > 0) aggiorna(0);
        setInTiro(false);
        return;
      }
      const delta = e.touches[0].clientY - statoTiro.current.y0;
      if (delta <= 0 || el.scrollTop > 0) {
        if (statoTiro.current.valore > 0) aggiorna(0);
        return;
      }
      e.preventDefault();
      // Meta' del dito: il tiro deve costare un po', o parte per sbaglio.
      aggiorna(Math.min(delta * 0.45, 96));
    };
    const fine = () => {
      if (!statoTiro.current.attivo) return;
      statoTiro.current.attivo = false;
      setInTiro(false);
      if (statoTiro.current.valore >= 64) {
        setRicarico(true);
        window.location.reload();
      } else {
        aggiorna(0);
      }
    };

    el.addEventListener("touchstart", inizio, { passive: true });
    el.addEventListener("touchmove", movimento, { passive: false });
    el.addEventListener("touchend", fine);
    el.addEventListener("touchcancel", fine);
    return () => {
      el.removeEventListener("touchstart", inizio);
      el.removeEventListener("touchmove", movimento);
      el.removeEventListener("touchend", fine);
      el.removeEventListener("touchcancel", fine);
    };
  }, [orizzontale]);

  const barra = sections.length > 1;

  /** Come sta questa voce della barra adesso. Le due di mezzo esistono solo
   *  mentre il dito e' giu': la pagina che si sta lasciando si spegne e la
   *  destinazione si accende **prima** del rilascio, cosi' si sa dove si sta
   *  andando finche' si e' ancora in tempo a tornare indietro. */
  const statoVoce = (href: string) => {
    if (anteprima?.percorso === href) return anteprima.sicura ? "sicura" : "vicina";
    if (pathname === href) return anteprima ? "lasciata" : "attiva";
    return "spenta";
  };

  const initials = identity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex h-app flex-col">
      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Marchio className="size-7 shrink-0" />
            <span className="truncate text-[15px] font-semibold tracking-tight">
              {title}
            </span>
          </div>

          {/* La barra in alto vale da `sm` in su. Sotto, le cinque etichette
              intere non ci stanno in una riga larga 375px — e accorciare i
              nomi delle pagine è escluso: quel nome lo impara chi le apre
              ogni giorno. Quindi da telefono la stessa navigazione scende in
              basso, dove ogni voce ha una colonna sua e l'etichetta resta
              scritta per intero. */}
          {barra ? (
            <nav
              aria-label="Sezioni"
              className="ml-2 hidden items-center gap-0.5 rounded-full bg-surface-3 p-0.5 sm:flex"
            >
              {sections.map(({ href, label, icon }) => {
                const Icon = ICONS[icon];
                const stato = statoVoce(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    className={cn(
                      "tap flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
                      stato === "attiva" && "bg-surface text-text shadow-soft",
                      stato === "lasciata" && "bg-surface text-muted shadow-soft",
                      stato === "sicura" && "bg-accent-soft text-accent",
                      stato === "vicina" && "text-text",
                      stato === "spenta" && "text-muted hover:text-text",
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />

            {/* Si apre al tocco, non al passaggio del mouse: su iPhone il
                mouse non passa mai, e la vecchia tendina appesa a
                `group-hover` la' non si apriva proprio. Il menu di Radix
                risponde al puntatore vero, qualunque sia — dito, mouse o
                tastiera — e si chiude da solo toccando fuori o con Esc. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                {/* La freccia dichiara che l'iniziale si apre: qui dentro
                    vivono Squadra e Impostazioni, e un cerchio muto non
                    dice a nessuno di andarle a cercare proprio li'. */}
                <button
                  type="button"
                  className="tap flex items-center gap-0.5 rounded-full pr-0.5"
                  aria-label={identity.name}
                >
                  <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                    {initials}
                  </span>
                  <ChevronDown className="size-3.5 text-muted" aria-hidden />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  // Senza questo, chiudendosi la tendina si riprende il fuoco
                  // e lo strappa al pannello della password che sta aprendo.
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  // L'animazione va legata allo stato aperto, non messa
                  // sempre: Radix tiene in vita la tendina finche' un
                  // fotogramma resta da disegnare, e una che si anima anche
                  // da chiusa resterebbe nel documento a coprire i click.
                  className="z-40 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-float data-[state=open]:animate-pop"
                >
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[13px] font-medium">
                      {identity.name}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {identity.email}
                    </p>
                    <p className="mt-1 text-[12px] uppercase tracking-wide text-faint">
                      {identity.roleLabel}
                    </p>
                  </div>

                  {voci.length > 0 ? (
                    <div className="mt-1 border-t border-border pt-1">
                      {voci.map(({ href, label, icon }) => {
                        const Icon = ICONS[icon];
                        return (
                          <DropdownMenu.Item key={href} asChild>
                            <Link
                              href={href}
                              aria-current={pathname === href ? "page" : undefined}
                              className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-text"
                            >
                              <Icon className="size-3.5" />
                              {label}
                            </Link>
                          </DropdownMenu.Item>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Fuori dalle voci di menu: toccando il tema la tendina
                      non si deve chiudere, si sta solo cambiando idea. */}
                  <div className="my-1 flex items-center justify-between gap-2 border-t border-border px-2.5 pt-2 sm:hidden">
                    <span className="text-[13px] text-muted">Tema</span>
                    <ThemeToggle />
                  </div>

                  <div className="border-t border-border pt-1">
                    <DropdownMenu.Item
                      onSelect={() => setCambioPassword(true)}
                      className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-text"
                    >
                      <KeyRound className="size-3.5" />
                      Cambia password
                    </DropdownMenu.Item>
                  </div>

                  <div className="border-t border-border pt-1">
                    {/* Il modulo di uscita sta fuori dalla tendina, e lo si
                        invia a mano: scegliendo la voce la tendina si smonta,
                        e un bottone che si porta via da solo il proprio invio
                        e' il modo silenzioso di non uscire mai. */}
                    <DropdownMenu.Item
                      onSelect={() => moduloEsci.current?.requestSubmit()}
                      className="tap flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-danger outline-none data-[highlighted]:bg-danger-soft"
                    >
                      <LogOut className="size-3.5" />
                      Esci
                    </DropdownMenu.Item>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>

      <form ref={moduloEsci} action={esci} className="hidden" />

      <PannelloCambiaPassword
        aperto={cambioPassword}
        onClose={() => setCambioPassword(false)}
      />

      {/* Il marchio che scende col dito: compare solo durante il tiro, e la
          transizione c'e' solo al rilascio — seguendo il dito deve stare
          incollato, non rincorrerlo. */}
      {tiro > 0 && !ricarico ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed left-1/2 top-14 z-40",
            !inTiro && "transition-transform",
          )}
          style={{
            transform: `translate(-50%, ${tiro - 48}px) rotate(${tiro * 2.4}deg)`,
            opacity: Math.min(tiro / 64, 1),
          }}
        >
          <div className="grid size-10 place-items-center rounded-full border border-border bg-surface shadow-float">
            <Marchio className="size-6 text-text" />
          </div>
        </div>
      ) : null}
      {ricarico ? <CaricamentoMarchio messaggio="Aggiorno…" /> : null}

      {/* min-h-0 flex-1: il figlio prende lo spazio rimasto senza sforare
          l'altezza dell'intestazione, cosa che h-full farebbe. */}
      {/* Qui dentro scorre tutto. La navigazione in basso sta *dopo*, nel
          flusso: si prende il suo spazio da sola e questa area si accorcia di
          conseguenza, quindi non serve nessuno spazio in fondo scritto a mano
          — quello sbagliava ogni volta che la navigazione cambiava forma. */}
      {/* overscroll-y-contain: il tiro e' nostro, quello del browser resta
          fuori — due spie di ricaricamento per lo stesso gesto sono una di
          troppo. */}
      {/* overflow-x-hidden: il foglio qui sotto esce di scena traslando, e
          senza questa riga uscirebbe **dentro** una barra di scorrimento
          orizzontale invece che fuori dallo schermo. */}
      <main
        ref={principale}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      >
        {/* Il foglio che il dito trascina. `key={pathname}`: cambiando pagina
            il nodo e' nuovo di zecca, quindi la trasformazione con cui il
            vecchio e' uscito di scena sparisce da sola — e l'animazione
            d'ingresso riparte senza doverla riavvolgere a mano. */}
        <div
          key={pathname}
          ref={foglio}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) entrataFinita();
          }}
          className={cn(
            "mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6 sm:py-7",
            classeEntrata,
          )}
        >
          {children}
        </div>
      </main>

      {barra ? (
        <nav
          aria-label="Sezioni"
          className="glass safe-bottom border-t border-border sm:hidden"
        >
          <div className="flex items-stretch">
            {sections.map(({ href, label, icon }) => {
              const Icon = ICONS[icon];
              const stato = statoVoce(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    // `min-w-0` su una colonna flex non e' pignoleria: senza,
                    // la colonna non scende mai sotto la larghezza della sua
                    // parola, e la voce col nome piu' lungo si prende lo
                    // spazio delle altre.
                    "tap flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pb-2 pt-2",
                    (stato === "attiva" || stato === "sicura") && "text-accent",
                    stato === "vicina" && "text-text",
                    (stato === "lasciata" || stato === "spenta") && "text-muted",
                  )}
                >
                  <Icon className="size-5" />
                  {/* L'etichetta c'e' sempre, su tutte le voci. Sotto i 640px
                      la barra di prima lasciava fino a sette icone mute senza
                      nemmeno un suggerimento, in un'app il cui utente di
                      massa sta su un telefono. */}
                  <span className="w-full text-center text-[12px] leading-none tracking-tight">
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

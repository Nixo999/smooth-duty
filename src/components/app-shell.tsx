"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Eye,
  House,
  KeyRound,
  LogOut,
  Settings2,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { PannelloCambiaPassword } from "@/components/auth/cambia-la-mia-password";
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
  oggi: House,
} as const;

export type Section = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Quante cose aspettano una decisione. Ce l'ha **una voce sola** in tutta
   *  la barra: due contatori sullo stesso dato insegnano a non fidarsi di
   *  nessuno dei due. */
  daDecidere?: number;
};

/** Il pallino sulla voce di menu. Il colore da solo non basta — a un uomo su
 *  dodici non dice niente — quindi accanto viaggia il numero scritto, che
 *  legge chi usa lo schermo con la voce. */
function Pallino({ quante }: { quante: number }) {
  return (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
      <span className="sr-only">
        , {quante} {quante === 1 ? "cosa" : "cose"} da decidere
      </span>
    </>
  );
}

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

  const barra = sections.length > 1;

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
            <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
              <CalendarDays className="size-4" />
            </div>
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
              {sections.map(({ href, label, icon, daDecidere }) => {
                const Icon = ICONS[icon];
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "tap flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
                      active
                        ? "bg-surface text-text shadow-soft"
                        : "text-muted hover:text-text",
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span>{label}</span>
                    {daDecidere ? <Pallino quante={daDecidere} /> : null}
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
                <button
                  type="button"
                  className="tap grid size-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
                  aria-label={identity.name}
                >
                  {initials}
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

      {/* min-h-0 flex-1: il figlio prende lo spazio rimasto senza sforare
          l'altezza dell'intestazione, cosa che h-full farebbe. */}
      {/* Qui dentro scorre tutto. La navigazione in basso sta *dopo*, nel
          flusso: si prende il suo spazio da sola e questa area si accorcia di
          conseguenza, quindi non serve nessuno spazio in fondo scritto a mano
          — quello sbagliava ogni volta che la navigazione cambiava forma. */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </div>
      </main>

      {barra ? (
        <nav
          aria-label="Sezioni"
          className="glass safe-bottom border-t border-border sm:hidden"
        >
          <div className="flex items-stretch">
            {sections.map(({ href, label, icon, daDecidere }) => {
              const Icon = ICONS[icon];
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // `min-w-0` su una colonna flex non e' pignoleria: senza,
                    // la colonna non scende mai sotto la larghezza della sua
                    // parola, e la voce col nome piu' lungo si prende lo
                    // spazio delle altre.
                    "tap flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 pb-2 pt-2",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <Icon className="size-5" />
                    {daDecidere ? <Pallino quante={daDecidere} /> : null}
                  </span>
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

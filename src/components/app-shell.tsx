"use client";

import { Building2, CalendarDays, ClipboardList, Eye, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
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
} as const;

export type Section = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
};

export function AppShell({
  title,
  sections,
  identity,
  esci,
  children,
}: {
  title: string;
  sections: Section[];
  identity: { name: string; email: string; roleLabel: string };
  esci: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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

          {sections.length > 1 ? (
            <nav
              aria-label="Sezioni"
              className="ml-2 flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5"
            >
              {sections.map(({ href, label, icon }) => {
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
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />

            <div className="group relative">
              <button
                type="button"
                className="tap grid size-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
                aria-label={identity.name}
              >
                {initials}
              </button>

              {/* Tendina su hover e su focus: da tastiera resta raggiungibile. */}
              <div className="invisible absolute right-0 top-full z-40 w-56 pt-2 opacity-0 transition-[opacity,visibility] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="animate-pop rounded-xl border border-border bg-surface p-1.5 shadow-float">
                  <div className="px-2.5 py-2">
                    <p className="truncate text-[13px] font-medium">
                      {identity.name}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {identity.email}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-faint">
                      {identity.roleLabel}
                    </p>
                  </div>

                  <div className="my-1 flex items-center justify-between gap-2 border-t border-border px-2.5 pt-2 sm:hidden">
                    <span className="text-[13px] text-muted">Tema</span>
                    <ThemeToggle />
                  </div>

                  <form action={esci} className="border-t border-border pt-1">
                    <button
                      type="submit"
                      className="tap flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger hover:bg-danger-soft"
                    >
                      <LogOut className="size-3.5" />
                      Esci
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* min-h-0 flex-1: il figlio prende lo spazio rimasto senza sforare
          l'altezza dell'intestazione, cosa che h-full farebbe. */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </div>
      </main>
    </div>
  );
}

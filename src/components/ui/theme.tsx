"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemes>
  );
}

const OPTIONS = [
  { value: "light", label: "Chiaro", Icon: Sun },
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "dark", label: "Scuro", Icon: Moon },
] as const;

/** Tre stati, non due: "sistema" e' quello giusto per la maggior parte delle
 *  persone e va potuto scegliere esplicitamente. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  // Il tema vero si conosce solo nel browser: renderizzarlo sul server
  // produrrebbe un lampeggio e un errore di idratazione. useSyncExternalStore
  // risponde "no" sul server e "si" nel browser senza passare da un effetto,
  // quindi senza il secondo disegno che un useState+useEffect comporta.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-surface-3 p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label="Tema"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "tap grid size-7 place-items-center rounded-full",
              active
                ? "bg-surface text-text shadow-soft"
                : "text-faint hover:text-muted",
            )}
          >
            <Icon className="size-[15px]" />
          </button>
        );
      })}
    </div>
  );
}
